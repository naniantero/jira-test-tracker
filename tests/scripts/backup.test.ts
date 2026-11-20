import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../..");

function backup(dest: string, env: Record<string, string>) {
  const r = spawnSync(process.execPath, ["scripts/backup.mjs", dest], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", ...env },
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "tt-backup-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("backup.mjs", { timeout: 30_000 }, () => {
  it("refuses on Postgres and points at pg_dump", () => {
    const dir = tempDir();
    const r = backup(join(dir, "b.db"), { DATABASE_URL: "postgres://user:s3cret@localhost:5432/tracker" });
    expect(r.status).toBe(1);
    expect(r.out.trim()).toBe('This deployment uses PostgreSQL. Back it up with pg_dump; see README "Backups".');
    expect(existsSync(join(dir, "b.db"))).toBe(false);
  });

  it("writes a SQLite snapshot with VACUUM INTO", async () => {
    const dir = tempDir();
    const source = join(dir, "app.db");
    const src = createClient({ url: `file:${source}` });
    await src.execute("PRAGMA journal_mode = WAL");
    await src.execute("CREATE TABLE t (v TEXT)");
    await src.execute({ sql: "INSERT INTO t VALUES (?)", args: ["kept"] });
    src.close();

    const dest = join(dir, "backups", "snap.db");
    const r = backup(dest, { DATABASE_PATH: source });
    expect(r.out.trim()).toBe(`Backup written to ${dest}`);
    expect(r.status).toBe(0);

    const copy = createClient({ url: `file:${dest}` });
    try {
      expect((await copy.execute("SELECT v FROM t")).rows.map((row) => row.v)).toEqual(["kept"]);
    } finally {
      copy.close();
    }
  });

  it("refuses to overwrite and reports a missing database", () => {
    const dir = tempDir();
    expect(backup(join(dir, "x.db"), { DATABASE_PATH: join(dir, "missing.db") })).toEqual({
      status: 1,
      out: `Database not found: ${join(dir, "missing.db")}\n`,
    });
    const r = backup(dir, { DATABASE_PATH: join(dir, "missing.db") });
    expect(r.status).toBe(1);
    expect(r.out).toContain("Refusing to overwrite existing file");
  });
});
