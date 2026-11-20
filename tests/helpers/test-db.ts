import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll } from "vitest";
import { createDb, migrateDb, wrapDb, type AppDb } from "@/lib/db";
import * as pgSchema from "@/lib/db/schemas/pg";

type Backend = "sqlite" | "pglite" | "postgres";

/**
 * A database for one test, on the backend named by TEST_DB (set per Vitest project):
 * - sqlite (default): a fresh migrated database in a temp file per call.
 * - pglite: one migrated in-memory instance per worker, every app table truncated per call.
 * - postgres: TEST_POSTGRES_URL, migrated on first use (later runs of the migrator are no-ops),
 *   every app table truncated per call. Its project runs files one at a time. The database name must
 *   contain "test" (see assertTestDatabaseUrl).
 * Shared instances ignore `close()`; they live as long as the worker.
 */
export async function createTestDb(): Promise<AppDb> {
  const backend = (process.env.TEST_DB ?? "sqlite") as Backend;
  switch (backend) {
    case "sqlite":
      return freshSqlite();
    case "pglite":
      return truncated(await shared("pglite", createPglite));
    case "postgres":
      return truncated(await shared("postgres", createPostgres));
    default:
      throw new Error(`Unknown TEST_DB "${String(backend)}"`);
  }
}

const tempDirs: string[] = [];
const openSqlite: AppDb[] = [];

afterAll(async () => {
  await Promise.all(openSqlite.splice(0).map((db) => db.close()));
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function freshSqlite(): Promise<AppDb> {
  // A temp file, as in production: it exercises WAL and file locking, which :memory: databases do not use.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-test-db-"));
  tempDirs.push(dir);
  const db = await createDb({ dialect: "sqlite", path: path.join(dir, "test.db") });
  openSqlite.push(db);
  await migrateDb(db);
  return db;
}

const globalForTestDb = globalThis as unknown as { __testDbs?: Map<string, Promise<AppDb>> };

function shared(key: string, create: () => Promise<AppDb>): Promise<AppDb> {
  const dbs = (globalForTestDb.__testDbs ??= new Map());
  let db = dbs.get(key);
  if (!db) {
    db = create();
    dbs.set(key, db);
  }
  return db;
}

async function createPglite(): Promise<AppDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = wrapDb(drizzle(client, { schema: pgSchema }), "pg", "pglite", async () => {});
  await migrateDb(db);
  return db;
}

async function createPostgres(): Promise<AppDb> {
  const url = process.env.TEST_POSTGRES_URL;
  if (!url) throw new Error("TEST_DB=postgres needs TEST_POSTGRES_URL");
  assertTestDatabaseUrl(url);
  const db = await createDb({ dialect: "pg", url });
  await migrateDb(db);
  return { ...db, close: async () => {} };
}

/**
 * The tests truncate every app table, so refuse any database whose name does not say it is for tests.
 * Errors name only the database: the URL may hold credentials.
 */
export function assertTestDatabaseUrl(url: string): void {
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    // The cause's message would contain the URL.
    throw new Error("TEST_POSTGRES_URL is not a valid URL.");
  }
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run the tests against database "${name || "(no name)"}": its name must contain "test" (the tests wipe it).`,
    );
  }
}

const appTables = Object.values(pgSchema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`)
  .join(", ");

async function truncated(db: AppDb): Promise<AppDb> {
  await db.orm.execute(sql.raw(`TRUNCATE ${appTables} RESTART IDENTITY CASCADE`));
  return db;
}
