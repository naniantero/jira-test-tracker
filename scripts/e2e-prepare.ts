/**
 * Fresh e2e database: wipes the data directory (`e2e/.data`, the one holding `DATABASE_PATH`), migrates, seeds
 * the admin and tester, and syncs every group file in `e2e/fixtures/cases/` in file-name order. Run by
 * Playwright's webServer before `next build && next start`; reads the same env as the app. On Postgres
 * (`E2E_DATABASE_URL`, passed on as `DATABASE_URL`) it drops and recreates schema `public`, and only on a
 * database whose name contains `e2e`.
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { sql } from "drizzle-orm";
import { createAuth } from "../src/lib/auth/auth";
import { createAppUser, seedAdmin } from "../src/lib/auth/users";
import { parseSyncFile, syncGroup } from "../src/lib/cases";
import { createDb, migrateDb, resolveDbConfig, type AppDb, type DbConfig } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { ADMIN, TESTER } from "../e2e/users";

async function main() {
  const env = getEnv();
  const cfg = resolveDbConfig(env);
  assertE2eDatabase(cfg);
  // The SQLite database lives here; the fake S3 holding the attachments starts empty on every run.
  rmSync(e2eDataDir(env.DATABASE_PATH), { recursive: true, force: true });

  const db = await createDb(cfg);
  if (db.dialect === "pg") await resetPgSchema(db);
  await migrateDb(db);
  const auth = createAuth(db, { secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL });

  await seedAdmin(auth, db, { username: ADMIN.username, password: ADMIN.password });
  await createAppUser(auth, {
    username: TESTER.username,
    name: TESTER.name,
    password: TESTER.password,
    role: "tester",
  });
  await seedCases(db);

  await db.close();
  console.log("[e2e] database prepared");
}

const CASES_DIR = join(import.meta.dirname, "../e2e/fixtures/cases");

async function seedCases(db: AppDb) {
  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const name of files) {
    const parsed = parseSyncFile(JSON.parse(readFileSync(join(CASES_DIR, name), "utf8")));
    if (!parsed.ok) {
      const errors = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
      throw new Error(`Invalid fixture ${name}: ${errors}`);
    }
    await syncGroup(db, parsed.file, { writer: { userId: null, name: "E2E" } });
  }
}

const E2E_DATA_DIR = /(^|\/)e2e\/\.data$/;

/** The directory of `DATABASE_PATH`, which must be `e2e/.data`: the only one ever wiped. */
function e2eDataDir(databasePath: string): string {
  const dir = normalize(dirname(databasePath));
  if (!E2E_DATA_DIR.test(dir)) throw new Error(`Refusing to wipe a non-e2e data directory: ${dir}`);
  return dir;
}

/** Never wipe a database that is not obviously a throwaway e2e one. */
function assertE2eDatabase(cfg: DbConfig) {
  if (cfg.dialect === "sqlite") {
    e2eDataDir(cfg.path);
    return;
  }
  // Only the database name: the URL may hold credentials.
  const name = decodeURIComponent(new URL(cfg.url).pathname.slice(1));
  if (!name.includes("e2e")) throw new Error(`Refusing to wipe a non-e2e database: ${name || "(no name)"}`);
}

/** Drops every table, Drizzle's migration history included (both live in `public`). */
async function resetPgSchema(db: AppDb) {
  await db.orm.execute(sql.raw("DROP SCHEMA public CASCADE"));
  await db.orm.execute(sql.raw("CREATE SCHEMA public"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
