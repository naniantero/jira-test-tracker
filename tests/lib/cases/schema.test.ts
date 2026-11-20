import { describe, expect, it } from "vitest";
import { caseInputSchema, groupInputSchema, parseSyncFile } from "@/lib/cases/schema";

describe("keys", () => {
  it("rejects a key starting with a dash or longer than 64 characters", () => {
    expect(groupInputSchema.safeParse({ key: "-x", title: "T" }).success).toBe(false);
    expect(caseInputSchema.safeParse({ key: "a".repeat(65), title: "T" }).success).toBe(false);
    expect(caseInputSchema.safeParse({ key: "a".repeat(64), title: "T" }).success).toBe(true);
    expect(caseInputSchema.safeParse({ key: "LOGIN-01.a_b", title: "T" }).success).toBe(true);
  });
});

describe("caseInputSchema", () => {
  it("fills defaults, trims criteria and drops empty lines", () => {
    const r = caseInputSchema.parse({ key: "A-1", title: " T ", acceptanceCriteria: [" one ", "  ", "", "two"] });
    expect(r).toEqual({ key: "A-1", title: "T", description: "", acceptanceCriteria: ["one", "two"] });
  });

  it("turns an empty reference into none and trims a given one", () => {
    expect(caseInputSchema.parse({ key: "A-1", title: "T", reference: "  " }).reference).toBeUndefined();
    expect(caseInputSchema.parse({ key: "A-1", title: "T", reference: " PROJ-1 " }).reference).toBe("PROJ-1");
  });

  it("counts criteria after dropping empty ones", () => {
    const blanks = Array.from({ length: 150 }, () => " ");
    const ok = caseInputSchema.safeParse({ key: "A-1", title: "T", acceptanceCriteria: [...blanks, "x"] });
    expect(ok.success).toBe(true);
    const many = Array.from({ length: 101 }, (_, i) => `c${i}`);
    expect(caseInputSchema.safeParse({ key: "A-1", title: "T", acceptanceCriteria: many }).success).toBe(false);
  });

  it("enforces the length limits", () => {
    const base = { key: "A-1", title: "T" };
    expect(caseInputSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(caseInputSchema.safeParse({ ...base, title: "x".repeat(501) }).success).toBe(false);
    expect(caseInputSchema.safeParse({ ...base, description: "x".repeat(50_001) }).success).toBe(false);
    expect(caseInputSchema.safeParse({ ...base, acceptanceCriteria: ["x".repeat(5001)] }).success).toBe(false);
    expect(caseInputSchema.safeParse({ ...base, reference: "x".repeat(501) }).success).toBe(false);
  });
});

describe("parseSyncFile", () => {
  const group = { key: "login", title: "Login" };

  it("accepts a file and an empty case list", () => {
    const r = parseSyncFile({ schemaVersion: 1, group, cases: [{ key: "L-1", title: "T" }] });
    expect(r.ok).toBe(true);
    expect(parseSyncFile({ schemaVersion: 1, group, cases: [] }).ok).toBe(true);
  });

  it("reports a duplicate case key at the second occurrence", () => {
    const r = parseSyncFile({
      schemaVersion: 1,
      group,
      cases: [
        { key: "L-1", title: "A" },
        { key: "L-1", title: "B" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toEqual(["cases.1.key"]);
  });

  it("rejects another schema version and reports paths of invalid fields", () => {
    expect(parseSyncFile({ schemaVersion: 2, group, cases: [] }).ok).toBe(false);
    const r = parseSyncFile({ schemaVersion: 1, group, cases: [{ key: "L-1", title: "" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].path).toBe("cases.0.title");
  });
});
