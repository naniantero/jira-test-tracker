import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { run } from "@/cli/commands";
import { listCases } from "@/lib/cases";
import type { AppDb } from "@/lib/db";
import { createTestDb } from "../helpers/test-db";

const SYNC_FILE = {
  schemaVersion: 1,
  group: { key: "login", title: "Login" },
  cases: [
    { key: "LOGIN-01", title: "Wrong password", acceptanceCriteria: ["Locks"] },
    { key: "LOGIN-02", title: "Right password" },
  ],
};

let db: AppDb;
let files: Record<string, string>;
let opened: number;

beforeEach(async () => {
  db = await createTestDb();
  files = { "f.json": JSON.stringify(SYNC_FILE) };
  opened = 0;
});

async function tt(...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(argv, {
    openDb: async () => {
      opened++;
      return db;
    },
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    readFile: (p) => {
      if (!(p in files)) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
      return files[p];
    },
  });
  return { code, stdout, stderr };
}

const events = (key: string) =>
  db.orm
    .select({
      actorName: db.t.storyEvents.actorName,
      userId: db.t.storyEvents.userId,
      comment: db.t.storyEvents.comment,
    })
    .from(db.t.storyEvents)
    .innerJoin(db.t.stories, eq(db.t.stories.id, db.t.storyEvents.storyId))
    .where(eq(db.t.stories.key, key));

describe("usage", () => {
  it("prints usage for --help and exits 0 without opening the database", async () => {
    const r = await tt("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("tt sync --file");
    expect(opened).toBe(0);
  });

  it("exits 2 with usage on no arguments, an unknown command or an unknown option", async () => {
    for (const argv of [[], ["nope"], ["group", "nope"], ["case", "list", "--bogus"], ["group", "export"]]) {
      const r = await tt(...argv);
      expect(r.code, argv.join(" ")).toBe(2);
      expect(r.stderr, argv.join(" ")).toContain("Usage");
      expect(r.stdout).toBe("");
    }
    expect(opened).toBe(0);
  });

  it("exits 2 when case create lacks a required option or gets both description options", async () => {
    expect((await tt("case", "create", "--group", "g", "--key", "K")).code).toBe(2);
    files["d.md"] = "x";
    const both = ["--description", "a", "--description-file", "d.md"];
    expect((await tt("case", "create", "--group", "g", "--key", "K", "--title", "T", ...both)).code).toBe(2);
  });

  it("exits 1 with only the message when the database cannot be opened", async () => {
    const message = "Migrations not found in /tmp/drizzle. Run the CLI from the app directory (/app in the container).";
    let stderr = "";
    const code = await run(["group", "list"], {
      openDb: () => Promise.reject(new Error(message)),
      stdout: () => {},
      stderr: (s) => (stderr += s),
      readFile: () => "",
    });
    expect(code).toBe(1);
    expect(stderr).toBe(`${message}\n`);
  });
});

describe("sync", () => {
  it("prints the plan as JSON on --dry-run and writes nothing", async () => {
    const r = await tt("sync", "--file", "f.json", "--dry-run", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      group: { key: "login", action: "created" },
      created: ["LOGIN-01", "LOGIN-02"],
      updated: [],
      moved: [],
      restored: [],
      archived: [],
      unchanged: [],
    });
    expect(await listCases(db, {})).toEqual([]);
  });

  it("syncs and prints one line per plan section", async () => {
    const r = await tt("sync", "--file", "f.json");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("Group login: created\nCreated: LOGIN-01, LOGIN-02\n");
    expect((await listCases(db, {})).map((c) => c.key)).toEqual(["LOGIN-01", "LOGIN-02"]);
  });

  it("reads - as stdin through readFile", async () => {
    files["-"] = JSON.stringify(SYNC_FILE);
    expect((await tt("sync", "--file", "-")).code).toBe(0);
  });

  it("exits 1 listing each validation error with its path, and writes nothing", async () => {
    files["bad.json"] = JSON.stringify({ ...SYNC_FILE, cases: [{ key: "-x", title: "" }] });
    const r = await tt("sync", "--file", "bad.json");
    expect(r.code).toBe(1);
    const lines = r.stderr.trim().split("\n");
    expect(lines).toContain("cases.0.key: Invalid key");
    expect(lines.some((l) => l.startsWith("cases.0.title: "))).toBe(true);
    expect(await listCases(db, {})).toEqual([]);
  });

  it("prints validation errors as one JSON document with --json", async () => {
    files["bad.json"] = JSON.stringify({ ...SYNC_FILE, cases: [{ key: "-x", title: "T" }] });
    const r = await tt("sync", "--file", "bad.json", "--json");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, errors: [{ path: "cases.0.key", message: "Invalid key" }] });
  });

  it("exits 1 on an unreadable file or invalid JSON", async () => {
    expect(await tt("sync", "--file", "missing.json")).toMatchObject({
      code: 1,
      stderr: expect.stringContaining("ENOENT"),
    });
    files["broken.json"] = "{";
    expect((await tt("sync", "--file", "broken.json")).code).toBe(1);
  });

  it("records --actor as the event actor when it changes a passed case", async () => {
    await tt("sync", "--file", "f.json");
    await db.orm.update(db.t.stories).set({ status: "passed" }).where(eq(db.t.stories.key, "LOGIN-01"));
    files["f.json"] = JSON.stringify({ ...SYNC_FILE, cases: [{ ...SYNC_FILE.cases[0], title: "New" }] });
    expect((await tt("sync", "--file", "f.json", "--actor", "Test agent")).code).toBe(0);
    expect(await events("LOGIN-01")).toEqual([{ actorName: "Test agent", userId: null, comment: "Changed: title." }]);
  });
});

describe("group", () => {
  beforeEach(async () => {
    await tt("sync", "--file", "f.json");
  });

  it("lists, exports, archives and restores", async () => {
    expect(JSON.parse((await tt("group", "list", "--json")).stdout)).toEqual([
      { key: "login", title: "Login", archived: false, position: 0 },
    ]);
    const exported = JSON.parse((await tt("group", "export", "login")).stdout);
    expect(exported).toMatchObject({ schemaVersion: 1, group: { key: "login" } });
    expect(exported.cases.map((c: { key: string }) => c.key)).toEqual(["LOGIN-01", "LOGIN-02"]);

    expect((await tt("group", "archive", "login")).code).toBe(0);
    expect((await tt("group", "list")).stdout).toBe("login\tLogin\t(archived)\n");
    expect((await tt("group", "restore", "login", "--json")).stdout).toBe('{"ok":true}\n');
  });

  it("exits 1 with the library's message for an unknown group", async () => {
    expect(await tt("group", "export", "nope")).toMatchObject({ code: 1, stderr: "Group not found.\n" });
    const r = await tt("group", "archive", "nope", "--json");
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, error: "Group not found." });
  });

  it("creates and updates a group", async () => {
    expect((await tt("group", "create", "--key", "g2", "--title", "Second")).code).toBe(0);
    expect((await tt("group", "update", "g2", "--title", "Renamed")).code).toBe(0);
    expect((await tt("group", "list")).stdout).toBe("login\tLogin\ng2\tRenamed\n");
  });
});

describe("case", () => {
  beforeEach(async () => {
    await tt("sync", "--file", "f.json");
  });

  it("creates a case that case list --json then shows", async () => {
    files["desc.md"] = "Steps";
    const r = await tt(
      ...["case", "create", "--group", "login", "--key", "LOGIN-03", "--title", "Logout"],
      ...["--description-file", "desc.md", "--criterion", "Ends", "--criterion", "Back", "--reference", "PROJ-1"],
    );
    expect(r.code).toBe(0);
    const list = JSON.parse((await tt("case", "list", "--json")).stdout);
    expect(list.at(-1)).toEqual({
      key: "LOGIN-03",
      title: "Logout",
      groupKey: "login",
      status: "untested",
      archived: false,
      position: 2,
      reference: "PROJ-1",
    });
    const exported = JSON.parse((await tt("group", "export", "login")).stdout);
    expect(exported.cases[2]).toMatchObject({ description: "Steps", acceptanceCriteria: ["Ends", "Back"] });
  });

  it("exits 1 with each problem for invalid input and with the message for a duplicate key", async () => {
    const bad = await tt("case", "create", "--group", "login", "--key=-x", "--title", "T");
    expect(bad).toMatchObject({ code: 1, stderr: "key: Invalid key\n" });
    const dup = await tt("case", "create", "--group", "login", "--key", "LOGIN-01", "--title", "T");
    expect(dup).toMatchObject({ code: 1, stderr: "A test case with this key already exists.\n" });
  });

  it("updates fields with --actor recorded on a passed case, and moves it with --group", async () => {
    await tt("group", "create", "--key", "other", "--title", "Other");
    await db.orm.update(db.t.stories).set({ status: "passed" }).where(eq(db.t.stories.key, "LOGIN-01"));
    const r = await tt(
      ...["case", "update", "LOGIN-01", "--title", "Renamed", "--criterion", "A", "--group", "other"],
      ...["--actor", "Test agent", "--json"],
    );
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ ok: true, changed: ["title", "acceptance criteria"] });
    expect(await events("LOGIN-01")).toEqual([
      { actorName: "Test agent", userId: null, comment: "Changed: title, acceptance criteria." },
    ]);
    expect((await tt("case", "list", "--group", "other")).stdout).toBe("LOGIN-01\tpassed\tother\tRenamed\n");
  });

  it("defaults the actor to CLI", async () => {
    await db.orm.update(db.t.stories).set({ status: "failed" }).where(eq(db.t.stories.key, "LOGIN-02"));
    await tt("case", "update", "LOGIN-02", "--description", "New");
    expect(await events("LOGIN-02")).toEqual([{ actorName: "CLI", userId: null, comment: "Changed: description." }]);
  });

  it("lists non-archived cases by default and only archived ones with --archived", async () => {
    expect((await tt("case", "archive", "LOGIN-02")).code).toBe(0);
    expect((await tt("case", "list")).stdout).toBe("LOGIN-01\tuntested\tlogin\tWrong password\n");
    expect((await tt("case", "list", "--archived")).stdout).toBe("LOGIN-02\tuntested\tlogin\tRight password\n");
    expect((await tt("case", "restore", "LOGIN-02")).code).toBe(0);
    expect((await tt("case", "list", "--archived")).stdout).toBe("");
  });

  it("exits 1 for an unknown case", async () => {
    expect(await tt("case", "archive", "NOPE")).toMatchObject({ code: 1, stderr: "Test case not found.\n" });
    expect(await tt("case", "update", "NOPE", "--title", "T")).toMatchObject({ code: 1 });
  });
});
