#!/usr/bin/env node
// Make an existing user an admin: node scripts/promote-admin.mjs <username>
// Uses the same database as the app: Postgres when DATABASE_URL (or DATABASE_URL_FILE) is postgres:// or
// postgresql://, otherwise SQLite at DATABASE_PATH.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROMOTE = `UPDATE "user" SET role = 'admin' WHERE username = `;

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Returns the number of rows changed. */
async function promotePg(url, username) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    return (await client.query(`${PROMOTE}$1`, [username])).rowCount;
  } catch (err) {
    // pg messages can name the database user: print only the SQLSTATE code.
    fail(`Database error${err?.code ? ` (${err.code})` : ""}. Check DATABASE_URL and that the app has started once.`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function promoteSqlite(file, username) {
  if (!existsSync(file)) fail(`Database not found: ${file}`);
  const { createClient } = await import("@libsql/client");
  // Waits for the app's write lock instead of failing at once with SQLITE_BUSY.
  const db = createClient({ url: `file:${file}`, timeout: 5000 });
  try {
    return (await db.execute({ sql: `${PROMOTE}?`, args: [username] })).rowsAffected;
  } catch (err) {
    fail(`Database error${err?.code ? ` (${err.code})` : ""}. Check DATABASE_PATH and that the app has started once.`);
  } finally {
    db.close();
  }
}

// better-auth stores usernames lowercased.
const username = process.argv[2]?.toLowerCase();
if (!username) {
  console.error("Usage: node scripts/promote-admin.mjs <username>");
  process.exit(2);
}

/** DATABASE_URL, or the content of the file named by DATABASE_URL_FILE, as the app reads it. */
function databaseUrl() {
  const file = process.env.DATABASE_URL_FILE;
  if (!file) return process.env.DATABASE_URL;
  if (process.env.DATABASE_URL) fail("Set DATABASE_URL or DATABASE_URL_FILE, not both");
  try {
    return readFileSync(file, "utf8").replace(/\r?\n$/, "");
  } catch (err) {
    fail(`Could not read DATABASE_URL_FILE (${file})${err?.code ? `: ${err.code}` : ""}`);
  }
}

const url = databaseUrl();
let changed;
if (!url) {
  changed = await promoteSqlite(resolve(process.env.DATABASE_PATH || "./data/app.db"), username);
} else if (/^postgres(ql)?:\/\//i.test(url)) {
  // Case-insensitive, as in the app (URL schemes are).
  changed = await promotePg(url, username);
} else {
  // Never echo the value: it may hold credentials.
  fail("Unsupported DATABASE_URL. Use postgres:// or postgresql://, or leave it empty to use SQLite.");
}

if (changed) console.log("Promoted.");
else fail("No such user.");
