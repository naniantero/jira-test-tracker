import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, migrateDb, writeTx, type AppDb } from "@/lib/db";

let dir: string;
let db: AppDb | undefined;

beforeEach((ctx) => {
  if ((process.env.TEST_DB ?? "sqlite") !== "sqlite") ctx.skip();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-pragmas-"));
});

afterEach(async () => {
  await db?.close();
  db = undefined;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const lite = (db: AppDb) => db.orm as unknown as LibSQLDatabase;
const secureDelete = async (db: AppDb) =>
  (await lite(db).all<{ secure_delete: number }>(sql`PRAGMA secure_delete`))[0].secure_delete;

describe("SQLite connection pragmas", () => {
  it("turns secure_delete on when the client is created", async () => {
    db = await createDb({ dialect: "sqlite", path: path.join(dir, "app.db") });
    expect(await secureDelete(db)).toBe(1);
  });

  it("keeps secure_delete on after migrating, a transaction and a failed statement", async () => {
    db = await createDb({ dialect: "sqlite", path: path.join(dir, "app.db") });
    await migrateDb(db);
    await writeTx(db, (tx) => tx.insert(db!.t.epics).values({ key: "E-1", title: "E-1", position: 0 }));
    await expect(
      writeTx(db, (tx) => tx.insert(db!.t.epics).values({ key: "E-1", title: "E-1", position: 1 })),
    ).rejects.toThrow();
    await expect(lite(db).run(sql`SELECT * FROM no_such_table`)).rejects.toThrow();
    expect(await secureDelete(db)).toBe(1);
    // Inside a transaction too: it runs on the connection the transaction holds.
    const inTx = await writeTx(db, async (tx) => {
      const rows = await (tx as unknown as LibSQLDatabase).all<{ secure_delete: number }>(sql`PRAGMA secure_delete`);
      return rows[0].secure_delete;
    });
    expect(inTx).toBe(1);
  });
});
