import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import type { z } from "zod";
import {
  caseInputSchema,
  createCase,
  createGroup,
  exportGroup,
  groupInputSchema,
  listCases,
  listGroups,
  parseSyncFile,
  setCaseArchived,
  setGroupArchived,
  syncGroup,
  updateCase,
  updateGroup,
  type SyncPlan,
  type Writer,
} from "@/lib/cases";
import { casePatchSchema, groupPatchSchema } from "@/lib/cases/schema";
import type { AppDb } from "@/lib/db/connect";
import { dbErrorLabel } from "@/lib/db/errors";
import type { Failure } from "@/lib/errors";
import { errorMessage } from "./messages";

export type Io = {
  /** Called only by commands that need the database, so usage errors and `--help` work without one. */
  openDb: () => Promise<AppDb>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** `-` is standard input. */
  readFile: (path: string) => string;
};

export const USAGE = `Usage: tt <command> [options] [--json]

  tt sync --file <path|-> [--dry-run] [--actor <name>]
  tt group list
  tt group export <key>
  tt group create --key <key> --title <title> [--description <markdown>]
  tt group update <key> [--title <title>] [--description <markdown>]
  tt group archive <key>
  tt group restore <key>
  tt case list [--group <key>] [--archived]
  tt case create --group <key> --key <key> --title <title>
      [--description <markdown> | --description-file <path|->] [--criterion <text>]... [--reference <ref>]
  tt case update <key> [--title <title>] [--description <markdown> | --description-file <path|->]
      [--criterion <text>]... [--reference <ref>] [--group <key>]
  tt case archive <key>
  tt case restore <key>

--json prints one JSON document to standard output. Commands that write take --actor <name> (default CLI),
the name on the timeline events they add. Exit codes: 0 done, 1 invalid input or not found, 2 usage error.
`;

type Values = ReturnType<typeof parseArgs>["values"];
type Ctx = { values: Values; args: string[]; io: Io; json: boolean; db: () => Promise<AppDb> };
type Command = {
  /** Names of the positional arguments, all required. */
  args?: string[];
  options?: ParseArgsOptionsConfig;
  writes?: boolean;
  run: (ctx: Ctx) => Promise<number>;
};
type Problem = { path: string; message: string };

/** Exit code 2: printed with the usage. */
class UsageError extends Error {}
/** Exit code 1: the message is safe to print as it is. */
class CliError extends Error {}

const caseFields: ParseArgsOptionsConfig = {
  title: { type: "string" },
  description: { type: "string" },
  "description-file": { type: "string" },
  criterion: { type: "string", multiple: true },
  reference: { type: "string" },
  group: { type: "string" },
};

const COMMANDS: Record<string, Command> = {
  sync: {
    options: { file: { type: "string" }, "dry-run": { type: "boolean" } },
    writes: true,
    async run(ctx) {
      const file = required(ctx, "file");
      let data: unknown;
      try {
        data = JSON.parse(readText(ctx, file));
      } catch (e) {
        if (e instanceof CliError) throw e;
        throw new CliError(`${file === "-" ? "Standard input" : file} is not valid JSON.`);
      }
      const parsed = parseSyncFile(data);
      if (!parsed.ok) return invalid(ctx, parsed.errors);
      const dryRun = ctx.values["dry-run"] === true;
      const plan = await syncGroup(await ctx.db(), parsed.file, { writer: writer(ctx), dryRun });
      return done(ctx, plan, planLines(plan, dryRun));
    },
  },
  "group list": {
    async run(ctx) {
      const groups = await listGroups(await ctx.db(), {});
      return done(
        ctx,
        groups,
        groups.map((g) => `${g.key}\t${g.title}${g.archived ? "\t(archived)" : ""}`),
      );
    },
  },
  "group export": {
    args: ["key"],
    async run(ctx) {
      const file = await exportGroup(await ctx.db(), ctx.args[0]);
      if (!file) return failed(ctx, { error: "groupNotFound" });
      ctx.io.stdout(JSON.stringify(file, null, 2) + "\n");
      return 0;
    },
  },
  "group create": {
    options: { key: { type: "string" }, title: { type: "string" }, description: { type: "string" } },
    writes: true,
    async run(ctx) {
      const input = validate(groupInputSchema, {
        key: required(ctx, "key"),
        title: required(ctx, "title"),
        description: str(ctx, "description"),
      });
      if (!input.ok) return invalid(ctx, input.errors);
      const r = await createGroup(await ctx.db(), input.data);
      return r.ok ? done(ctx, r, [`Created group ${input.data.key}.`]) : failed(ctx, r);
    },
  },
  "group update": {
    args: ["key"],
    options: { title: { type: "string" }, description: { type: "string" } },
    writes: true,
    async run(ctx) {
      const patch = validate(groupPatchSchema, { title: str(ctx, "title"), description: str(ctx, "description") });
      if (!patch.ok) return invalid(ctx, patch.errors);
      const r = await updateGroup(await ctx.db(), ctx.args[0], patch.data);
      return r.ok ? done(ctx, r, [`Updated group ${ctx.args[0]}.`]) : failed(ctx, r);
    },
  },
  "group archive": groupArchived(true),
  "group restore": groupArchived(false),
  "case list": {
    options: { group: { type: "string" }, archived: { type: "boolean" } },
    async run(ctx) {
      const cases = await listCases(await ctx.db(), {
        groupKey: str(ctx, "group"),
        archived: ctx.values.archived === true,
      });
      return done(
        ctx,
        cases,
        cases.map((c) => `${c.key}\t${c.status}\t${c.groupKey}\t${c.title}`),
      );
    },
  },
  "case create": {
    options: { ...caseFields, key: { type: "string" } },
    writes: true,
    async run(ctx) {
      const group = required(ctx, "group");
      const input = validate(caseInputSchema, {
        key: required(ctx, "key"),
        title: required(ctx, "title"),
        description: description(ctx),
        acceptanceCriteria: list(ctx, "criterion"),
        reference: str(ctx, "reference"),
      });
      if (!input.ok) return invalid(ctx, input.errors);
      const r = await createCase(await ctx.db(), group, input.data);
      return r.ok ? done(ctx, r, [`Created test case ${input.data.key}.`]) : failed(ctx, r);
    },
  },
  "case update": {
    args: ["key"],
    options: caseFields,
    writes: true,
    async run(ctx) {
      const patch = validate(casePatchSchema, {
        title: str(ctx, "title"),
        description: description(ctx),
        acceptanceCriteria: list(ctx, "criterion"),
        reference: str(ctx, "reference"),
        groupKey: str(ctx, "group"),
      });
      if (!patch.ok) return invalid(ctx, patch.errors);
      const r = await updateCase(await ctx.db(), ctx.args[0], patch.data, writer(ctx));
      if (!r.ok) return failed(ctx, r);
      const changed = r.changed.length > 0 ? ` (${r.changed.join(", ")})` : "";
      return done(ctx, r, [`Updated test case ${ctx.args[0]}${changed}.`]);
    },
  },
  "case archive": caseArchived(true),
  "case restore": caseArchived(false),
};

function groupArchived(archived: boolean): Command {
  return {
    args: ["key"],
    writes: true,
    async run(ctx) {
      const r = await setGroupArchived(await ctx.db(), ctx.args[0], archived);
      return r.ok ? done(ctx, r, [`${archived ? "Archived" : "Restored"} group ${ctx.args[0]}.`]) : failed(ctx, r);
    },
  };
}

function caseArchived(archived: boolean): Command {
  return {
    args: ["key"],
    writes: true,
    async run(ctx) {
      const r = await setCaseArchived(await ctx.db(), ctx.args[0], archived);
      return r.ok ? done(ctx, r, [`${archived ? "Archived" : "Restored"} test case ${ctx.args[0]}.`]) : failed(ctx, r);
    },
  };
}

/** Runs `tt` with `argv` (without the node and script paths) and returns the exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") {
    io.stdout(USAGE);
    return 0;
  }
  if (argv.length === 0) return usage(io);
  const name = argv[0] === "sync" ? "sync" : argv.slice(0, 2).join(" ");
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) return usage(io, `Unknown command "${name}".`);

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv.slice(name.split(" ").length),
      options: {
        json: { type: "boolean" },
        ...(command.writes ? { actor: { type: "string" } } : {}),
        ...command.options,
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (e) {
    return usage(io, (e as Error).message);
  }
  const names = command.args ?? [];
  if (parsed.positionals.length !== names.length) {
    return usage(io, `tt ${name} takes ${names.length === 0 ? "no arguments" : names.map((n) => `<${n}>`).join(" ")}.`);
  }

  let db: Promise<AppDb> | undefined;
  const ctx: Ctx = {
    values: parsed.values,
    args: parsed.positionals,
    io,
    json: parsed.values.json === true,
    db: () =>
      (db ??= io.openDb().catch((e: unknown) => {
        throw new CliError(e instanceof Error ? e.message : String(e));
      })),
  };
  try {
    return await command.run(ctx);
  } catch (e) {
    if (e instanceof UsageError) return usage(io, e.message);
    // Other errors come from the driver, whose messages can name the database user: print only the code.
    return report(ctx, e instanceof CliError ? e.message : `Database error (${dbErrorLabel(e)}).`);
  }
}

function usage(io: Io, message?: string): number {
  io.stderr(`${message ? `${message}\n\n` : ""}${USAGE}`);
  return 2;
}

function str(ctx: Ctx, name: string): string | undefined {
  const v = ctx.values[name];
  return typeof v === "string" ? v : undefined;
}

function list(ctx: Ctx, name: string): string[] | undefined {
  const v = ctx.values[name];
  return Array.isArray(v) ? v.map(String) : undefined;
}

function required(ctx: Ctx, name: string): string {
  const v = str(ctx, name);
  if (v === undefined) throw new UsageError(`--${name} is required.`);
  return v;
}

function writer(ctx: Ctx): Writer {
  return { userId: null, name: str(ctx, "actor") || "CLI" };
}

function readText(ctx: Ctx, file: string): string {
  try {
    return ctx.io.readFile(file);
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    throw new CliError(`Could not read ${file}${typeof code === "string" ? `: ${code}` : ""}.`);
  }
}

function description(ctx: Ctx): string | undefined {
  const text = str(ctx, "description");
  const file = str(ctx, "description-file");
  if (text !== undefined && file !== undefined) {
    throw new UsageError("Use --description or --description-file, not both.");
  }
  return file === undefined ? text : readText(ctx, file);
}

function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: Problem[] } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, errors: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
}

function print(ctx: Ctx, data: unknown, lines: string[], to: "stdout" | "stderr" = "stdout"): void {
  if (ctx.json) ctx.io.stdout(JSON.stringify(data) + "\n");
  else ctx.io[to](lines.map((l) => `${l}\n`).join(""));
}

function done(ctx: Ctx, data: unknown, lines: string[]): number {
  print(ctx, data, lines);
  return 0;
}

function report(ctx: Ctx, message: string): number {
  print(ctx, { ok: false, error: message }, [message], "stderr");
  return 1;
}

function failed(ctx: Ctx, failure: Pick<Failure, "error" | "values">): number {
  return report(ctx, errorMessage(failure));
}

function invalid(ctx: Ctx, errors: Problem[]): number {
  print(
    ctx,
    { ok: false, errors },
    errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)),
    "stderr",
  );
  return 1;
}

function planLines(plan: SyncPlan, dryRun: boolean): string[] {
  const lines = [`Group ${plan.group.key}: ${plan.group.action}`];
  const section = (label: string, items: string[]) => {
    if (items.length > 0) lines.push(`${label}: ${items.join(", ")}`);
  };
  section("Created", plan.created);
  section(
    "Updated",
    plan.updated.map((u) => (u.fields.length > 0 ? `${u.key} (${u.fields.join(", ")})` : u.key)),
  );
  section(
    "Moved",
    plan.moved.map((m) => `${m.key} (from ${m.from})`),
  );
  section("Restored", plan.restored);
  section("Archived", plan.archived);
  section("Unchanged", plan.unchanged);
  if (dryRun) lines.push("Dry run: nothing was written.");
  return lines;
}
