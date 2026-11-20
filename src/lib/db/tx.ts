import { eq, sql } from "drizzle-orm";
import type { AppDb, Tx } from "./connect";

/**
 * Runs `fn` in a write transaction. Inside `fn`, use only `tx` (never `db.orm`), and never catch an error
 * and carry on: Postgres aborts the whole transaction on any failed statement.
 *
 * SQLite: libsql's default transaction mode "write" begins with `BEGIN IMMEDIATE`, so the write lock is
 * taken up front (Drizzle's `behavior` option is ignored by the libsql driver). Postgres: READ COMMITTED.
 */
export function writeTx<T>(db: AppDb, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.orm.transaction(fn);
}

/** Advisory lock key shared by test case writes (exclusive) and tester writes (shared). */
export const SYNC_LOCK_KEY = 482_901_317;

/**
 * Postgres: transaction-scoped advisory lock; test case writes take it exclusive, tester writes shared.
 * SQLite: no-op, `BEGIN IMMEDIATE` already serializes writers. Lock order: this, then `lockEpicRow`.
 */
export async function lockSync(db: AppDb, tx: Tx, mode: "exclusive" | "shared"): Promise<void> {
  if (db.dialect !== "pg") return;
  await tx.execute(
    mode === "exclusive"
      ? sql`select pg_advisory_xact_lock(${SYNC_LOCK_KEY})`
      : sql`select pg_advisory_xact_lock_shared(${SYNC_LOCK_KEY})`,
  );
}

/** Postgres: `SELECT id FROM epics WHERE id = $1 FOR UPDATE`. SQLite: no-op (see `lockSync`). */
export async function lockEpicRow(db: AppDb, tx: Tx, epicId: number): Promise<void> {
  if (db.dialect !== "pg") return;
  await tx.select({ id: db.t.epics.id }).from(db.t.epics).where(eq(db.t.epics.id, epicId)).for("update");
}
