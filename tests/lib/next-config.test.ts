import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config headers", () => {
  it("sends X-Frame-Options and Referrer-Policy on every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
      ]),
    );
  });
});

describe("next.config serverExternalPackages", () => {
  it("keeps the database drivers external and drops the old SQLite driver", () => {
    expect(nextConfig.serverExternalPackages).toEqual(expect.arrayContaining(["@libsql/client", "libsql", "pg"]));
    expect(nextConfig.serverExternalPackages).not.toContain("better-sqlite3");
  });
});
