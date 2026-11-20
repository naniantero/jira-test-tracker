#!/usr/bin/env node
// Online SQLite backup: node scripts/backup.mjs <dest-file>
// Uses VACUUM INTO, which is safe while the app is running (WAL mode).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@libsql/client";

if (process.env.DATABASE_URL || process.env.DATABASE_URL_FILE) {
  console.error('This deployment uses PostgreSQL. Back it up with pg_dump; see README "Backups".');
  process.exit(1);
}
const dest = process.argv[2];
if (!dest) {
  console.error("Usage: node scripts/backup.mjs <dest-file>");
  process.exit(2);
}
const target = resolve(dest);
if (existsSync(target)) {
  console.error(`Refusing to overwrite existing file: ${target}`);
  process.exit(1);
}
const source = resolve(process.env.DATABASE_PATH || "./data/app.db");
if (!existsSync(source)) {
  console.error(`Database not found: ${source}`);
  process.exit(1);
}
mkdirSync(dirname(target), { recursive: true });
// Waits for the app's write lock instead of failing at once with SQLITE_BUSY.
const db = createClient({ url: `file:${source}`, timeout: 5000 });
try {
  await db.execute({ sql: "VACUUM INTO ?", args: [target] });
  console.log(`Backup written to ${target}`);
} finally {
  db.close();
}
