import type { Failure } from "@/lib/errors";

export const STATUSES = ["untested", "passed", "failed", "retest"] as const;
export type StoryStatus = (typeof STATUSES)[number];
export type Role = "tester" | "admin";
export type TransitionTarget = {
  status: StoryStatus;
  commentRequired: boolean;
  override: boolean;
};

type Rule = {
  from: StoryStatus;
  to: StoryStatus;
  commentRequired: boolean;
  adminOnly?: boolean;
};

const RULES: readonly Rule[] = [
  { from: "untested", to: "passed", commentRequired: false },
  { from: "untested", to: "failed", commentRequired: true },
  { from: "retest", to: "passed", commentRequired: false },
  { from: "retest", to: "failed", commentRequired: true },
  { from: "passed", to: "failed", commentRequired: true },
  { from: "failed", to: "passed", commentRequired: true },
  { from: "failed", to: "retest", commentRequired: false, adminOnly: true },
];

export function allowedTargets(from: StoryStatus, role: Role): TransitionTarget[] {
  const normal: TransitionTarget[] = RULES.filter((r) => r.from === from && (!r.adminOnly || role === "admin")).map(
    (r) => ({ status: r.to, commentRequired: r.commentRequired, override: false }),
  );
  if (role !== "admin") return normal;
  const overrides: TransitionTarget[] = STATUSES.filter((s) => s !== from && !normal.some((n) => n.status === s)).map(
    (s) => ({ status: s, commentRequired: true, override: true }),
  );
  return [...normal, ...overrides];
}

export function checkTransition(i: {
  from: StoryStatus;
  to: StoryStatus;
  role: Role;
  comment: string | null;
}): { ok: true } | Failure {
  if (i.from === i.to) return { ok: false, error: "alreadyHasStatus" };
  const target = allowedTargets(i.from, i.role).find((t) => t.status === i.to);
  if (!target) return { ok: false, error: "notAllowed" };
  if (target.commentRequired && !(i.comment ?? "").trim()) {
    return { ok: false, error: "commentRequired" };
  }
  return { ok: true };
}
