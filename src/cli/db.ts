import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { resolveDbConfig, type DbConfig } from "@/lib/db/config";
import { createDb, type AppDb } from "@/lib/db/connect";
import { dbErrorLabel } from "@/lib/db/errors";
import { readSecretFiles } from "@/lib/env";

export const NOT_MIGRATED = "Database not migrated. Start the app once to create or migrate the database.";

/** The database part of the environment only: the CLI never needs the app's other variables or secrets. */
export function cliDbConfig(source: Record<string, string | undefined>): DbConfig {
  const { DATABASE_URL, DATABASE_URL_FILE, DATABASE_PATH } = source;
  const env = readSecretFiles({ DATABASE_URL, DATABASE_URL_FILE });
  return resolveDbConfig({ DATABASE_URL: env.DATABASE_URL, DATABASE_PATH: DATABASE_PATH || "./data/app.db" });
}

/** Opens the database without migrating it: refuses one the app has not created or brought up to date. */
export async function openCliDb(cfg: DbConfig): Promise<AppDb> {
  // libsql would create a missing file.
  if (cfg.dialect === "sqlite" && !fs.existsSync(path.resolve(cfg.path))) throw new Error(NOT_MIGRATED);
  const db = await createDb(cfg);
  try {
    await assertMigrated(db);
  } catch (e) {
    await db.close();
    throw e;
  }
  return db;
}

/** The latest migration in `drizzle/<dialect>/meta/_journal.json` (as `migrateDb` locates it) has been applied. */
export async function assertMigrated(db: AppDb): Promise<void> {
  const dir = path.join(process.cwd(), "drizzle");
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, db.dialect, "meta", "_journal.json"), "utf8");
  } catch {
    throw new Error(`Migrations not found in ${dir}. Run the CLI from the app directory (/app in the container).`);
  }
  const { entries } = JSON.parse(text) as { entries: { when: number }[] };
  const latest = entries.at(-1)?.when;
  let applied: boolean;
  try {
    if (db.dialect === "sqlite") {
      const orm = db.orm as unknown as LibSQLDatabase;
      const [table] = await orm.all(
        sql`select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'`,
      );
      applied =
        table !== undefined &&
        (await orm.all(sql`select 1 from __drizzle_migrations where created_at = ${latest}`)).length > 0;
    } else {
      const { rows } = await db.orm.execute(sql`select to_regclass('public.__drizzle_migrations') as t`);
      applied =
        rows[0]?.t !== null &&
        (await db.orm.execute(sql`select 1 from public.__drizzle_migrations where created_at = ${latest}`)).rows
          .length > 0;
    }
  } catch (e) {
    // pg messages can name the database user: keep only the code.
    throw new Error(`Database error (${dbErrorLabel(e)}). Check the database settings.`);
  }
  if (!applied) throw new Error(NOT_MIGRATED);
}
