import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDb, migrateDb } from "@/lib/db";

const REPO_ROOT = resolve(__dirname, "../..");

function promote(username: string, dbPath: string, databaseUrl = "") {
  const r = spawnSync(process.execPath, ["scripts/promote-admin.mjs", username], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_PATH: dbPath },
  });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A migrated temp SQLite database holding one tester, `alice`. */
async function dbWithTester(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "tt-promote-"));
  dirs.push(dir);
  const file = join(dir, "app.db");
  const db = await createDb({ dialect: "sqlite", path: file });
  try {
    await migrateDb(db);
    await db.orm
      .insert(db.t.user)
      .values({ id: "u1", name: "Alice", email: "alice@users.invalid", username: "alice", role: "tester" });
  } finally {
    await db.close();
  }
  return file;
}

async function roleOf(file: string, username: string) {
  const db = await createDb({ dialect: "sqlite", path: file });
  try {
    const [row] = await db.orm.select({ role: db.t.user.role }).from(db.t.user).where(eq(db.t.user.username, username));
    return row?.role;
  } finally {
    await db.close();
  }
}

describe("promote-admin.mjs", { timeout: 30_000 }, () => {
  it("promotes an existing user", async () => {
    const file = await dbWithTester();
    expect(promote("alice", file)).toEqual({ status: 0, out: "Promoted.\n" });
    expect(await roleOf(file, "alice")).toBe("admin");
  });

  it("matches the username case-insensitively, as better-auth stores it lowercased", async () => {
    const file = await dbWithTester();
    expect(promote("Alice", file)).toEqual({ status: 0, out: "Promoted.\n" });
    expect(await roleOf(file, "alice")).toBe("admin");
  });

  it("reports a SQLite error briefly, without a stack trace", () => {
    const dir = mkdtempSync(join(tmpdir(), "tt-promote-"));
    dirs.push(dir);
    const file = join(dir, "empty.db");
    writeFileSync(file, ""); // A valid SQLite file without the user table.
    expect(promote("alice", file)).toEqual({
      status: 1,
      out: "Database error (SQLITE_ERROR). Check DATABASE_PATH and that the app has started once.\n",
    });
  });

  it("treats the postgres scheme case-insensitively and never prints credentials", () => {
    // Nothing listens on port 1, so reaching the pg path shows as a connection error.
    const r = promote("alice", "/nonexistent/app.db", "POSTGRES://admin:s3cret@127.0.0.1:1/tracker?sslmode=disable");
    expect(r.status).toBe(1);
    expect(r.out).toBe("Database error (ECONNREFUSED). Check DATABASE_URL and that the app has started once.\n");
  });

  it("reports an unknown user", async () => {
    const file = await dbWithTester();
    expect(promote("bob", file)).toEqual({ status: 1, out: "No such user.\n" });
    expect(await roleOf(file, "alice")).toBe("tester");
  });
});
