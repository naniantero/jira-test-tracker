import { getEnv } from "@/lib/env";
import { resolveDbConfig } from "./config";
import { createDb, type AppDb } from "./connect";

export { describeDbConfig, resolveDbConfig, type DbConfig } from "./config";
export {
  createDb,
  migrateDb,
  pingDb,
  wrapDb,
  type AppDb,
  type Dialect,
  type Driver,
  type Orm,
  type Queryable,
  type Tables,
  type Tx,
} from "./connect";
export { SYNC_LOCK_KEY, lockEpicRow, lockSync, writeTx } from "./tx";

const globalForDb = globalThis as unknown as { __appDb?: Promise<AppDb> };

/** The app's database, created on first call from the environment and shared across hot reloads. */
export function getDb(): Promise<AppDb> {
  // Inside `.then` so that a bad environment rejects the promise instead of throwing synchronously.
  return (globalForDb.__appDb ??= Promise.resolve()
    .then(() => createDb(resolveDbConfig(getEnv())))
    .catch((e: unknown) => {
      globalForDb.__appDb = undefined;
      throw e;
    }));
}
