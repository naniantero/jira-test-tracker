import { describe, it, expect } from "vitest";
import { STATUSES, allowedTargets, checkTransition, type Role, type StoryStatus } from "@/lib/stories/status";

const rows: [StoryStatus, StoryStatus, boolean, "both" | "admin"][] = [
  ["untested", "passed", false, "both"],
  ["untested", "failed", true, "both"],
  ["retest", "passed", false, "both"],
  ["retest", "failed", true, "both"],
  ["passed", "failed", true, "both"],
  ["failed", "passed", true, "both"],
  ["failed", "retest", false, "admin"],
];
const NOT_ALLOWED = "notAllowed";
const COMMENT = "commentRequired";

describe("checkTransition rules table", () => {
  for (const [from, to, req, who] of rows) {
    for (const role of ["tester", "admin"] as Role[]) {
      const allowed = who === "both" || role === "admin";
      it(`${role}: ${from} -> ${to}`, () => {
        const withComment = checkTransition({ from, to, role, comment: "because" });
        if (!allowed) {
          expect(withComment).toEqual({ ok: false, error: NOT_ALLOWED });
          return;
        }
        expect(withComment).toEqual({ ok: true });
        const without = checkTransition({ from, to, role, comment: null });
        expect(without).toEqual(req ? { ok: false, error: COMMENT } : { ok: true });
      });
    }
  }
});

describe("checkTransition edge cases", () => {
  it("tester failed -> retest not allowed", () => {
    expect(checkTransition({ from: "failed", to: "retest", role: "tester", comment: "x" })).toEqual({
      ok: false,
      error: NOT_ALLOWED,
    });
  });
  it("tester passed -> untested not allowed", () => {
    expect(checkTransition({ from: "passed", to: "untested", role: "tester", comment: "x" })).toEqual({
      ok: false,
      error: NOT_ALLOWED,
    });
  });
  it("admin override needs comment", () => {
    expect(checkTransition({ from: "passed", to: "untested", role: "admin", comment: "x" })).toEqual({ ok: true });
    expect(checkTransition({ from: "passed", to: "untested", role: "admin", comment: null })).toEqual({
      ok: false,
      error: COMMENT,
    });
  });
  it("whitespace comment does not count", () => {
    expect(checkTransition({ from: "untested", to: "failed", role: "tester", comment: "   " })).toEqual({
      ok: false,
      error: COMMENT,
    });
  });
  it("same status", () => {
    for (const s of STATUSES) {
      for (const role of ["tester", "admin"] as Role[]) {
        expect(checkTransition({ from: s, to: s, role, comment: "x" })).toEqual({
          ok: false,
          error: "alreadyHasStatus",
        });
      }
    }
  });
});

describe("allowedTargets", () => {
  it("failed/tester", () => {
    expect(allowedTargets("failed", "tester")).toEqual([{ status: "passed", commentRequired: true, override: false }]);
  });
  it("failed/admin", () => {
    const t = allowedTargets("failed", "admin");
    expect(t).toContainEqual({ status: "retest", commentRequired: false, override: false });
    expect(t).toContainEqual({ status: "untested", commentRequired: true, override: true });
    expect(t.map((x) => x.status)).not.toContain("failed");
    expect(new Set(t.map((x) => x.status)).size).toBe(t.length);
  });
});
