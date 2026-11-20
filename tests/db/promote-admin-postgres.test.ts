import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/test-db";

// The SQLite side is covered in tests/scripts/promote-admin.test.ts. This runs only in the db:postgres
// project, which exists when TEST_POSTGRES_URL is set, so it shares that project's one-file-at-a-time database.
describe("promote-admin.mjs on Postgres", { timeout: 30_000 }, () => {
  it("promotes an existing user", async (ctx) => {
    if (process.env.TEST_DB !== "postgres") ctx.skip("Postgres only: set TEST_POSTGRES_URL");
    const db = await createTestDb(); // migrated and truncated
    await db.orm.insert(db.t.user).values({
      id: "u1",
      name: "Legacy Admin",
      email: "legacyadmin@users.invalid",
      username: "legacyadmin",
      role: "tester",
    });

    const r = spawnSync(process.execPath, ["scripts/promote-admin.mjs", "LegacyAdmin"], {
      cwd: resolve(__dirname, "../.."),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: process.env.TEST_POSTGRES_URL, DATABASE_PATH: "/nonexistent/app.db" },
    });
    expect({ status: r.status, out: r.stdout + r.stderr }).toEqual({ status: 0, out: "Promoted.\n" });

    const [row] = await db.orm.select({ role: db.t.user.role }).from(db.t.user).where(eq(db.t.user.id, "u1"));
    expect(row.role).toBe("admin");
  });
});
