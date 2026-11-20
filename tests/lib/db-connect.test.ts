import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createDb } from "@/lib/db";

afterEach(() => vi.restoreAllMocks());

describe("createDb (pg)", () => {
  it("logs an idle client error by code only, without the message or credentials, instead of crashing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // Nothing listens on port 1; the pool connects lazily, so no query is ever sent.
    const db = await createDb({ dialect: "pg", url: "postgres://u:p4ssw0rd@127.0.0.1:1/x" });
    const pool = (db.orm as unknown as { $client: Pool }).$client;

    // pg messages can name the role, for example `terminating connection for user "tracker"`.
    const err = Object.assign(new Error('terminating connection for user "tracker"'), { code: "57P01" });
    expect(() => pool.emit("error", err)).not.toThrow();
    expect(() => pool.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    expect(log.mock.calls).toEqual([
      ["[db] idle Postgres client error (57P01)"],
      ["[db] idle Postgres client error (Error)"],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/tracker|terminat|p4ssw0rd|127\.0\.0\.1|postgres:\/\//);
    await db.close();
  });

  it("gives up connecting after a timeout", async () => {
    const db = await createDb({ dialect: "pg", url: "postgres://u:p@127.0.0.1:1/x" });
    const pool = (db.orm as unknown as { $client: Pool }).$client;
    expect(pool.options.connectionTimeoutMillis).toBe(10_000);
    expect(pool.options.max).toBe(10);
    await db.close();
  });
});
