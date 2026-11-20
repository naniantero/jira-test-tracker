import { afterAll, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ current: { DATABASE_URL: "", DATABASE_PATH: ":memory:" } }));
vi.mock("@/lib/env", () => ({ getEnv: () => env.current }));

import { getDb } from "@/lib/db";

const globalForDb = globalThis as unknown as { __appDb?: Promise<{ close(): Promise<void> }> };

afterAll(async () => {
  await (await globalForDb.__appDb)?.close();
  globalForDb.__appDb = undefined;
});

describe("getDb", () => {
  it("forgets a failed attempt, so the boot retry gets a fresh one, and then memoizes the database", async () => {
    env.current = { DATABASE_URL: "mysql://h/db", DATABASE_PATH: ":memory:" };
    await expect(getDb()).rejects.toThrow(/Unsupported DATABASE_URL scheme/);
    expect(globalForDb.__appDb).toBeUndefined();

    env.current = { DATABASE_URL: "", DATABASE_PATH: ":memory:" };
    const db = await getDb();
    expect(db.dialect).toBe("sqlite");
    expect(await getDb()).toBe(db);
  });
});
