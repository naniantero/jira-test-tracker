import { readFileSync } from "node:fs";
import type { AppDb } from "@/lib/db/connect";
import { run } from "./commands";
import { cliDbConfig, openCliDb } from "./db";

async function main(): Promise<number> {
  let db: Promise<AppDb> | undefined;
  try {
    return await run(process.argv.slice(2), {
      openDb: () => (db ??= Promise.resolve().then(() => openCliDb(cliDbConfig(process.env)))),
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
      readFile: (path) => readFileSync(path === "-" ? 0 : path, "utf8"),
    });
  } finally {
    await db?.then((d) => d.close()).catch(() => {});
  }
}

// Not process.exit(): it can cut off output still being written to a pipe.
void main().then((code) => (process.exitCode = code));
