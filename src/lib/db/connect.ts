import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type Transaction, type TransactionMode } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { DbConfig } from "./config";
import { dbErrorLabel } from "./errors";
import * as pgSchema from "./schemas/pg";
import * as sqliteSchema from "./schemas/sqlite";

export type Dialect = "sqlite" | "pg";
export type Driver = "libsql" | "node-postgres" | "pglite";
export type Tables = typeof import("./schemas/pg");
/** Typed as Postgres; the SQLite instance is cast to it (both schemas export the same names and shapes). */
export type Orm = NodePgDatabase<Tables>;
export type Tx = Parameters<Parameters<Orm["transaction"]>[0]>[0];
/** Either the database or an open transaction: for query helpers called from both. */
export type Queryable = Orm | Tx;
export type AppDb = { orm: Orm; t: Tables; dialect: Dialect; driver: Driver; close(): Promise<void> };

const SQLITE_BUSY_TIMEOUT_MS = 5000;
const PG_POOL_MAX = 10;
/** Without it, connecting to an unreachable host waits for the OS TCP timeout (minutes). */
const PG_CONNECTION_TIMEOUT_MS = 10_000;

export async function createDb(cfg: DbConfig): Promise<AppDb> {
  if (cfg.dialect === "pg") {
    const pool = new Pool({
      connectionString: cfg.url,
      max: PG_POOL_MAX,
      connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
    });
    // An idle client dying (server restart, failover) emits 'error' on the pool; unhandled, it kills the process.
    // The pool drops that client and opens a new one on demand. Log only the code: pg messages can name the role.
    pool.on("error", (err) => console.error(`[db] idle Postgres client error (${dbErrorLabel(err)})`));
    return wrapDb(drizzlePg(pool, { schema: pgSchema }), "pg", "node-postgres", () => pool.end());
  }

  const isFile = cfg.path !== ":memory:";
  if (isFile) fs.mkdirSync(path.dirname(path.resolve(cfg.path)), { recursive: true });
  const raw = createClient({
    url: isFile ? `file:${path.resolve(cfg.path)}` : ":memory:",
    // Applied as the busy timeout of every connection the client's pool opens.
    timeout: SQLITE_BUSY_TIMEOUT_MS,
    // One connection: `serializeClient` already runs one operation at a time, so a second would add nothing,
    // and per-connection settings (secure_delete below) then have exactly one connection to cover.
    concurrency: 1,
  });
  const client = serializeClient(raw, enableSecureDelete);
  try {
    // libsql enables foreign keys on every new connection; fail loudly if a build ever stops doing so.
    const fk = await client.execute("PRAGMA foreign_keys");
    if (Number(fk.rows[0]?.[0]) !== 1) throw new Error("SQLite foreign key enforcement is not enabled.");
    const secure = await client.execute("PRAGMA secure_delete");
    if (Number(secure.rows[0]?.[0]) !== 1) throw new Error("SQLite secure_delete is not enabled.");
    // WAL is stored in the database file, so it holds for every connection.
    if (isFile) await client.execute("PRAGMA journal_mode = WAL");
  } catch (e) {
    raw.close();
    throw e;
  }
  return wrapDb(drizzleLibsql(client, { schema: sqliteSchema }), "sqlite", "libsql", async () => raw.close());
}

/**
 * Deleted and overwritten values are zeroed in the file rather than left in free space, so a deleted row cannot
 * be read back from the pages. The pragma is per connection and not stored
 * in the file; `serializeClient` runs this before the first operation and again after anything that may have
 * cost the pool its connection.
 */
async function enableSecureDelete(client: Client): Promise<void> {
  await client.execute("PRAGMA secure_delete = ON");
}

export function wrapDb(orm: unknown, dialect: Dialect, driver: Driver, close: () => Promise<void>): AppDb {
  const t = (dialect === "pg" ? pgSchema : sqliteSchema) as unknown as Tables;
  return { orm: orm as Orm, t, dialect, driver, close };
}

export async function migrateDb(db: AppDb): Promise<void> {
  const root = path.join(process.cwd(), "drizzle");
  switch (db.driver) {
    case "libsql": {
      const { migrate } = await import("drizzle-orm/libsql/migrator");
      await migrate(db.orm as never, { migrationsFolder: path.join(root, "sqlite") });
      return;
    }
    case "node-postgres": {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db.orm, { migrationsFolder: path.join(root, "pg"), migrationsSchema: "public" });
      return;
    }
    case "pglite": {
      // Dynamic so that nothing in src/ pulls PGlite (a dev-only dependency) into the app bundle.
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      await migrate(db.orm as never, { migrationsFolder: path.join(root, "pg"), migrationsSchema: "public" });
      return;
    }
  }
}

export async function pingDb(db: AppDb): Promise<void> {
  if (db.dialect === "sqlite") await (db.orm as unknown as LibSQLDatabase).run(sql`select 1`);
  else await db.orm.execute(sql`select 1`);
}

/**
 * Runs every operation on the libsql client one at a time; a transaction holds the turn until it settles.
 *
 * libsql's local client executes statements synchronously, so SQLite's busy timeout blocks the event loop:
 * a second connection waiting for the write lock would also stop the transaction holding it from finishing,
 * and fail with SQLITE_BUSY once the timeout runs out. Queuing in-process keeps that wait off the event loop;
 * the busy timeout still covers other processes (backups, the sqlite3 shell). The app runs as one instance.
 *
 * `setup` applies per-connection settings at the start of a turn: first, and again after any failed operation,
 * rolled-back transaction or reconnect. Those are the only ways the client's single connection can be closed
 * and replaced by a fresh one without them (libsql drops a connection it cannot roll back or finds closed).
 */
function serializeClient(client: Client, setup: (client: Client) => Promise<void>): Client {
  let tail: Promise<void> = Promise.resolve();
  let needsSetup = true;
  const turn = async (): Promise<() => void> => {
    let release!: () => void;
    const done = new Promise<void>((resolve) => (release = resolve));
    const ready = tail.then(() => release);
    tail = tail.then(() => done);
    const releaseTurn = await ready;
    if (needsSetup) {
      try {
        await setup(client);
        needsSetup = false;
      } catch (e) {
        releaseTurn();
        throw e;
      }
    }
    return releaseTurn;
  };
  const run = async <T>(op: () => Promise<T>): Promise<T> => {
    const release = await turn();
    try {
      return await op();
    } catch (e) {
      needsSetup = true;
      throw e;
    } finally {
      release();
    }
  };

  const gated: Partial<Client> = {
    execute: ((...args: Parameters<Client["execute"]>) => run(() => client.execute(...args))) as Client["execute"],
    batch: (...args) => run(() => client.batch(...args)),
    migrate: (...args) => run(() => client.migrate(...args)),
    executeMultiple: (...args) => run(() => client.executeMultiple(...args)),
    sync: () => run(() => client.sync()),
    async transaction(mode?: TransactionMode) {
      const release = await turn();
      try {
        return releaseOnSettle(await client.transaction(mode), release, () => (needsSetup = true));
      } catch (e) {
        needsSetup = true;
        release();
        throw e;
      }
    },
    close: () => client.close(),
    reconnect: () => {
      needsSetup = true;
      return client.reconnect();
    },
  };
  return Object.defineProperties(gated, {
    closed: { get: () => client.closed },
    protocol: { get: () => client.protocol },
  }) as Client;
}

/** `onFailure`: the transaction did not commit cleanly, so its connection may have been dropped. */
function releaseOnSettle(tx: Transaction, release: () => void, onFailure: () => void): Transaction {
  const settle = async (op: () => Promise<void> | void, failed = false) => {
    try {
      await op();
    } catch (e) {
      failed = true;
      throw e;
    } finally {
      if (failed) onFailure();
      release();
    }
  };
  return {
    execute: ((...args: Parameters<Transaction["execute"]>) => tx.execute(...args)) as Transaction["execute"],
    batch: (...args) => tx.batch(...args),
    executeMultiple: (...args) => tx.executeMultiple(...args),
    commit: () => settle(() => tx.commit()),
    rollback: () => settle(() => tx.rollback(), true),
    close: () => void settle(() => tx.close(), true),
    get closed() {
      return tx.closed;
    },
  };
}
