import { describe, expect, it, vi } from "vitest";
import { createDb, migrateDb } from "@/lib/db";
import { connectWithRetry, dbBootErrorLine } from "@/lib/db/boot";
import { dbErrorLabel, isTransientDbError } from "@/lib/db/errors";

const withCode = (code: string, message = "boom") => Object.assign(new Error(message), { code });

describe("isTransientDbError", () => {
  it.each(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET", "57P03"])(
    "treats %s as transient",
    (code) => {
      expect(isTransientDbError(withCode(code))).toBe(true);
    },
  );

  it.each([
    "Connection terminated",
    "Connection terminated unexpectedly",
    "Connection terminated due to connection timeout",
  ])('treats pg\'s "%s" (no code) as transient', (message) =>
    expect(isTransientDbError(new Error(message))).toBe(true),
  );

  it("looks through a wrapping error's cause and an AggregateError's errors", () => {
    const wrapped = new Error("Failed query: create schema", { cause: withCode("ECONNREFUSED") });
    expect(isTransientDbError(wrapped)).toBe(true);
    expect(isTransientDbError(new AggregateError([withCode("ECONNREFUSED"), withCode("ECONNREFUSED")]))).toBe(true);
  });

  it.each([
    ["wrong password", withCode("28P01", 'password authentication failed for user "tracker"')],
    ["missing database", withCode("3D000", 'database "tracker" does not exist')],
    ["SQL error behind a wrapper", new Error("Failed query", { cause: withCode("42P01") })],
    ["plain error", new Error("SQLite foreign key enforcement is not enabled.")],
    ["a message that only mentions a termination", new Error("Connection terminated by the admin, please retry")],
    ["non-error value", "ECONNREFUSED"],
  ])("does not treat %s as transient", (_, err) => {
    expect(isTransientDbError(err)).toBe(false);
  });

  it("recognizes the error a real pg connection to a closed port raises", async () => {
    // Nothing listens on port 1: the migrator's first query fails to connect.
    const db = await createDb({ dialect: "pg", url: "postgres://u:p4ssw0rd@127.0.0.1:1/x" });
    const err = await migrateDb(db).then(
      () => undefined,
      (e: unknown) => e,
    );
    await db.close();
    expect(isTransientDbError(err)).toBe(true);
    expect(dbErrorLabel(err)).toBe("ECONNREFUSED");
  });
});

describe("dbErrorLabel", () => {
  it("prefers the first code in the cause chain, else the error's name", () => {
    expect(dbErrorLabel(new Error("Failed query", { cause: withCode("28P01") }))).toBe("28P01");
    expect(dbErrorLabel(new TypeError("x"))).toBe("TypeError");
    expect(dbErrorLabel("not an error")).toBe("unknown");
  });

  it("ignores a code or name that is not a plain identifier", () => {
    const odd = Object.assign(new Error("x"), { code: 'for user "tracker"' });
    odd.name = "s3cret value";
    expect(dbErrorLabel(odd)).toBe("unknown");
  });
});

describe("dbBootErrorLine", () => {
  it("names the code and the target, never the message", () => {
    const err = new Error("Failed query", {
      cause: withCode("28P01", 'password authentication failed for user "tracker" (password s3cret)'),
    });
    const line = dbBootErrorLine(err, "postgres db:5432/tracker");
    expect(line).toBe("[boot] database error (28P01): postgres db:5432/tracker");
    expect(line).not.toMatch(/tracker"|s3cret|password/);
  });
});

describe("connectWithRetry", () => {
  /** A clock that only moves when the code under test sleeps. */
  function fakeTime() {
    let t = 0;
    const sleeps: number[] = [];
    return {
      sleeps,
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
    };
  }

  it("retries transient errors with doubling, capped backoff, then returns the result", async () => {
    const time = fakeTime();
    const log = vi.fn();
    const connect = vi.fn<() => Promise<string>>();
    for (let i = 0; i < 4; i++) connect.mockRejectedValueOnce(withCode("ECONNREFUSED", 'role "tracker" s3cret'));
    connect.mockResolvedValueOnce("db");

    await expect(connectWithRetry(connect, { ...time, log })).resolves.toBe("db");
    expect(connect).toHaveBeenCalledTimes(5);
    expect(time.sleeps).toEqual([1000, 2000, 4000, 5000]);
    expect(log).toHaveBeenCalledTimes(4);
    expect(log).toHaveBeenCalledWith("[boot] database not reachable yet (ECONNREFUSED), retrying…");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/tracker|s3cret/);
  });

  it("fails immediately on a non-transient error", async () => {
    const time = fakeTime();
    const log = vi.fn();
    const err = withCode("28P01");
    const connect = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    await expect(connectWithRetry(connect, { ...time, log })).rejects.toBe(err);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(time.sleeps).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("gives up with the last error once the deadline has passed", async () => {
    const time = fakeTime();
    const last = withCode("ENOTFOUND");
    // Sleeps 1 + 2 + 4 + 5 × 10 = 57 s, then 3 s to reach the 60 s deadline exactly, then one last attempt.
    const connect = vi.fn<() => Promise<string>>(async () => {
      throw time.now() >= 60_000 ? last : withCode("ECONNREFUSED");
    });

    await expect(connectWithRetry(connect, { ...time, log: () => {} })).rejects.toBe(last);
    expect(time.sleeps.reduce((a, b) => a + b, 0)).toBe(60_000);
    expect(time.sleeps.at(-1)).toBe(3000);
    expect(Math.max(...time.sleeps)).toBe(5000);
    expect(connect).toHaveBeenCalledTimes(time.sleeps.length + 1);
  });
});
