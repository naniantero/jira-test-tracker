import { describe, expect, it } from "vitest";
import { parseEnv, readSecretFiles } from "@/lib/env";

const base = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("applies defaults for paths", () => {
    expect(parseEnv(base).DATABASE_PATH).toBe("./data/app.db");
  });

  it("leaves ATTACHMENTS_BUCKET_URL optional, treats an empty string as unset and rejects a malformed one", () => {
    expect(parseEnv(base).ATTACHMENTS_BUCKET_URL).toBeUndefined();
    expect(parseEnv({ ...base, ATTACHMENTS_BUCKET_URL: "" }).ATTACHMENTS_BUCKET_URL).toBeUndefined();
    expect(parseEnv({ ...base, ATTACHMENTS_BUCKET_URL: "s3://bucket" }).ATTACHMENTS_BUCKET_URL).toBe("s3://bucket");
    expect(() => parseEnv({ ...base, ATTACHMENTS_BUCKET_URL: "ftp://bucket" })).toThrow(
      "ATTACHMENTS_BUCKET_URL must be",
    );
  });

  it("leaves DATABASE_URL optional and treats an empty string as unset", () => {
    expect(parseEnv(base).DATABASE_URL).toBeUndefined();
    expect(parseEnv({ ...base, DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
    expect(parseEnv({ ...base, DATABASE_URL: "postgres://u:p@db/tracker" }).DATABASE_URL).toBe(
      "postgres://u:p@db/tracker",
    );
  });

  it("rejects a secret shorter than 32 chars", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "x".repeat(31) })).toThrow();
  });

  it("rejects ADMIN_USERNAME without ADMIN_PASSWORD", () => {
    expect(() => parseEnv({ ...base, ADMIN_USERNAME: "admin" })).toThrow();
  });

  it("rejects an ADMIN_PASSWORD shorter than 10 chars", () => {
    expect(() => parseEnv({ ...base, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "123456789" })).toThrow();
  });
});

describe("readSecretFiles", () => {
  const files: Record<string, string> = {
    "/run/secrets/db": "postgres://u:p@db/tracker\n",
    "/run/secrets/secret": "s".repeat(32),
  };
  const readFile = (path: string) => {
    if (!(path in files)) throw new Error(`ENOENT: ${path}`);
    return files[path];
  };

  it("reads a secret from the file named by <NAME>_FILE and drops one trailing newline", () => {
    const source = readSecretFiles({ ...base, DATABASE_URL_FILE: "/run/secrets/db" }, readFile);
    expect(parseEnv(source).DATABASE_URL).toBe("postgres://u:p@db/tracker");
  });

  it("leaves the source alone without *_FILE variables", () => {
    expect(readSecretFiles(base, readFile)).toEqual(base);
  });

  it("treats an empty *_FILE as unset", () => {
    expect(readSecretFiles({ ...base, BETTER_AUTH_SECRET_FILE: "" }, readFile).BETTER_AUTH_SECRET).toBe(
      base.BETTER_AUTH_SECRET,
    );
  });

  it("rejects a variable set both directly and through a file", () => {
    expect(() => readSecretFiles({ ...base, BETTER_AUTH_SECRET_FILE: "/run/secrets/secret" }, readFile)).toThrow(
      "Set BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE, not both",
    );
  });

  it("names the variable and the path when the file cannot be read", () => {
    expect(() => readSecretFiles({ ...base, DATABASE_URL_FILE: "/run/secrets/missing" }, readFile)).toThrow(
      "Could not read DATABASE_URL_FILE (/run/secrets/missing)",
    );
  });

  it("ignores *_FILE for variables that are not secrets", () => {
    const source = readSecretFiles({ ...base, DATABASE_PATH_FILE: "/run/secrets/db" }, readFile);
    expect(source.DATABASE_PATH).toBeUndefined();
  });
});
