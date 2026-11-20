import type { StoryStatus } from "./status";

export type ProgressCounts = {
  total: number;
  untested: number;
  passed: number;
  failed: number;
  retest: number;
  tested: number;
};

export function computeProgress(statuses: StoryStatus[]): ProgressCounts {
  const c = { total: statuses.length, untested: 0, passed: 0, failed: 0, retest: 0 };
  for (const s of statuses) c[s] += 1;
  return { ...c, tested: c.total - c.untested };
}

export function isComplete(c: ProgressCounts): boolean {
  return c.total > 0 && c.passed === c.total;
}
