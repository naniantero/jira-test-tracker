import { describe, expect, it } from "vitest";
import { describeDbConfig, resolveDbConfig } from "@/lib/db/config";

function thrownMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected a throw");
}

describe("resolveDbConfig", () => {
  it("uses SQLite when DATABASE_URL is unset or empty", () => {
    expect(resolveDbConfig({ DATABASE_PATH: "/d/app.db" })).toEqual({ dialect: "sqlite", path: "/d/app.db" });
    expect(resolveDbConfig({ DATABASE_URL: "", DATABASE_PATH: "/d/app.db" })).toEqual({
      dialect: "sqlite",
      path: "/d/app.db",
    });
  });

  it("uses Postgres for postgres:// and postgresql://", () => {
    for (const url of ["postgres://u:p@db.example.com/tracker", "postgresql://u:p@db.example.com:5433/tracker"]) {
      expect(resolveDbConfig({ DATABASE_URL: url, DATABASE_PATH: "/d/app.db" })).toEqual({ dialect: "pg", url });
    }
  });

  it("rejects other schemes without echoing the URL", () => {
    const call = () => resolveDbConfig({ DATABASE_URL: "mysql://u:s3cret@h/db", DATABASE_PATH: "x" });
    expect(call).toThrow(
      'Unsupported DATABASE_URL scheme "mysql:". Use postgres:// or postgresql://, or leave DATABASE_URL empty to use SQLite.',
    );
    expect(thrownMessage(call)).not.toContain("s3cret");
  });

  it("rejects an unparsable URL without echoing it", () => {
    const call = () => resolveDbConfig({ DATABASE_URL: "not a url s3cret", DATABASE_PATH: "x" });
    expect(call).toThrow("DATABASE_URL is not a valid URL.");
    expect(thrownMessage(call)).not.toContain("s3cret");
  });

  it("rejects a value without // after the scheme without echoing any of it", () => {
    const call = () => resolveDbConfig({ DATABASE_URL: "admin:s3cret@db/x", DATABASE_PATH: "x" });
    expect(call).toThrow("DATABASE_URL is not a valid URL.");
    expect(thrownMessage(call)).not.toContain("admin");
    expect(thrownMessage(call)).not.toContain("s3cret");
  });
});

describe("credentials that would parse as host, port or path", () => {
  const unencoded = [
    "postgres://u:/s3cret@host/db",
    "postgres://admin:2024/s3cret@host/db",
    "postgres://admin:#s3cret@host/db",
  ];
  const message = "DATABASE_URL is not a valid URL. If the password contains special characters, percent-encode them.";

  it.each(unencoded)("rejects %s without echoing it", (url) => {
    for (const call of [
      () => resolveDbConfig({ DATABASE_URL: url, DATABASE_PATH: "x" }),
      () => describeDbConfig({ dialect: "pg", url }),
    ]) {
      expect(thrownMessage(call)).toBe(message);
      expect(thrownMessage(call)).not.toContain("s3cret");
      expect(thrownMessage(call)).not.toContain("admin");
    }
  });

  it("accepts the same password percent-encoded", () => {
    const url = "postgres://admin:2024%2Fs3cret@host/db";
    expect(resolveDbConfig({ DATABASE_URL: url, DATABASE_PATH: "x" })).toEqual({ dialect: "pg", url });
    expect(describeDbConfig({ dialect: "pg", url })).toBe("postgres host/db");
  });
});

describe("describeDbConfig", () => {
  it("describes the backend without credentials", () => {
    expect(
      describeDbConfig({ dialect: "pg", url: "postgres://user:s3cret@db.example.com:5433/tracker?sslmode=require" }),
    ).toBe("postgres db.example.com:5433/tracker");
    expect(describeDbConfig({ dialect: "pg", url: "postgresql://u:p@db/tracker" })).toBe("postgres db/tracker");
    expect(describeDbConfig({ dialect: "sqlite", path: "/data/app.db" })).toBe("sqlite /data/app.db");
  });
});
