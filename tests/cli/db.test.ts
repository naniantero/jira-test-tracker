import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertMigrated, cliDbConfig, NOT_MIGRATED, openCliDb } from "@/cli/db";
import { createDb, migrateDb, wrapDb } from "@/lib/db";
import * as pgSchema from "@/lib/db/schemas/pg";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cli-db-"));
  dirs.push(dir);
  return dir;
}

describe("cliDbConfig", () => {
  it("reads only the database variables, without BETTER_AUTH_SECRET", () => {
    expect(cliDbConfig({ DATABASE_PATH: "x.db" })).toEqual({ dialect: "sqlite", path: "x.db" });
    expect(cliDbConfig({ BETTER_AUTH_SECRET_FILE: "/does/not/exist" })).toEqual({
      dialect: "sqlite",
      path: "./data/app.db",
    });
    expect(cliDbConfig({ DATABASE_URL: "", DATABASE_PATH: "" })).toEqual({ dialect: "sqlite", path: "./data/app.db" });
    expect(cliDbConfig({ DATABASE_URL: "postgres://u:p@h/db", DATABASE_PATH: "x.db" })).toEqual({
      dialect: "pg",
      url: "postgres://u:p@h/db",
    });
  });

  it("reads DATABASE_URL_FILE", () => {
    const file = path.join(tempDir(), "url");
    fs.writeFileSync(file, "postgresql://h/db\n");
    expect(cliDbConfig({ DATABASE_URL_FILE: file })).toEqual({ dialect: "pg", url: "postgresql://h/db" });
    expect(() => cliDbConfig({ DATABASE_URL_FILE: file, DATABASE_URL: "postgres://h/db" })).toThrow(/not both/);
  });
});

describe("openCliDb", () => {
  it("rejects a missing SQLite file and creates nothing", async () => {
    const file = path.join(tempDir(), "sub", "app.db");
    await expect(openCliDb({ dialect: "sqlite", path: file })).rejects.toThrow(NOT_MIGRATED);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });

  it("rejects an empty SQLite database, and opens a migrated one", async () => {
    const file = path.join(tempDir(), "app.db");
    const empty = await createDb({ dialect: "sqlite", path: file });
    await empty.close();
    await expect(openCliDb({ dialect: "sqlite", path: file })).rejects.toThrow(
      "Database not migrated. Start the app once to create or migrate the database.",
    );

    const db = await createDb({ dialect: "sqlite", path: file });
    await migrateDb(db);
    await db.close();
    const opened = await openCliDb({ dialect: "sqlite", path: file });
    await opened.close();
  });

  it("rejects a SQLite database missing the latest migration", async () => {
    const file = path.join(tempDir(), "app.db");
    const db = await createDb({ dialect: "sqlite", path: file });
    await migrateDb(db);
    await (db.orm as unknown as LibSQLDatabase).run(sql`update __drizzle_migrations set created_at = 1`);
    await db.close();
    await expect(openCliDb({ dialect: "sqlite", path: file })).rejects.toThrow(NOT_MIGRATED);
  });
});

describe("assertMigrated outside the app directory", () => {
  it("names the missing migrations directory", async () => {
    const file = path.join(tempDir(), "app.db");
    const db = await createDb({ dialect: "sqlite", path: file });
    await migrateDb(db);
    const cwd = tempDir();
    const spy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
    try {
      await expect(assertMigrated(db)).rejects.toThrow(
        `Migrations not found in ${path.join(cwd, "drizzle")}. Run the CLI from the app directory (/app in the container).`,
      );
    } finally {
      spy.mockRestore();
      await db.close();
    }
  });
});

describe("assertMigrated on Postgres (PGlite)", () => {
  it("rejects without the migrations table or the latest entry, and accepts a migrated database", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite();
    const db = wrapDb(drizzle(client, { schema: pgSchema }), "pg", "pglite", () => client.close());
    try {
      await expect(assertMigrated(db)).rejects.toThrow(NOT_MIGRATED);
      await migrateDb(db);
      await expect(assertMigrated(db)).resolves.toBeUndefined();
      await db.orm.execute(sql`update public.__drizzle_migrations set created_at = 1`);
      await expect(assertMigrated(db)).rejects.toThrow(NOT_MIGRATED);
    } finally {
      await db.close();
    }
  });
});
