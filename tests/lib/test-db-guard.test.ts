import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "../helpers/test-db";

describe("assertTestDatabaseUrl", () => {
  it("accepts a database whose decoded name contains test", () => {
    expect(() => assertTestDatabaseUrl("postgres://postgres:pg@localhost:55432/tracker_test")).not.toThrow();
    expect(() => assertTestDatabaseUrl("postgres://u:p@h/my%20test%20db?sslmode=disable")).not.toThrow();
  });

  it("refuses a database whose name does not contain test, naming only the database", () => {
    const url = "postgres://tracker:s3cret@db.example.com:5432/tracker?sslmode=require";
    expect(() => assertTestDatabaseUrl(url)).toThrow(
      'Refusing to run the tests against database "tracker": its name must contain "test" (the tests wipe it).',
    );
    try {
      assertTestDatabaseUrl(url);
    } catch (e) {
      expect(String(e)).not.toMatch(/s3cret|db\.example|sslmode|tracker:/);
    }
  });

  it("refuses a URL without a database name, and does not take a test in the host or user", () => {
    expect(() => assertTestDatabaseUrl("postgres://test:test@test-host/")).toThrow('database "(no name)"');
  });
});
