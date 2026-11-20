import { and, asc, eq, isNotNull, isNull, type AnyColumn, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import type { StoryStatus } from "@/lib/stories/status";
import { decodeCriteria } from "./criteria";
import type { SyncFile } from "./schema";

export type GroupSummary = { key: string; title: string; archived: boolean; position: number };
export type GroupDetail = { key: string; title: string; description: string | null; archived: boolean };
export type CaseSummary = {
  key: string;
  title: string;
  groupKey: string;
  status: StoryStatus;
  archived: boolean;
  position: number;
  reference: string | null;
};

export type CaseDetail = {
  key: string;
  groupKey: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  reference: string | null;
  status: StoryStatus;
  archived: boolean;
};

const archivedFilter = (column: AnyColumn, archived?: boolean): SQL | undefined =>
  archived === undefined ? undefined : archived ? isNotNull(column) : isNull(column);

/** Groups by position. `archived` left out lists both kinds. */
export async function listGroups(db: AppDb, opts: { archived?: boolean }): Promise<GroupSummary[]> {
  const { epics } = db.t;
  const rows = await db.orm
    .select()
    .from(epics)
    .where(archivedFilter(epics.archivedAt, opts.archived))
    .orderBy(asc(epics.position), asc(epics.id));
  return rows.map((g) => ({ key: g.key, title: g.title, archived: g.archivedAt !== null, position: g.position }));
}

/** Cases by group position, then their own. `groupKey` and `archived` left out do not filter. */
export async function listCases(db: AppDb, opts: { groupKey?: string; archived?: boolean }): Promise<CaseSummary[]> {
  const { epics, stories } = db.t;
  const rows = await db.orm
    .select({ story: stories, groupKey: epics.key })
    .from(stories)
    .innerJoin(epics, eq(epics.id, stories.epicId))
    .where(
      and(
        opts.groupKey === undefined ? undefined : eq(epics.key, opts.groupKey),
        archivedFilter(stories.archivedAt, opts.archived),
      ),
    )
    .orderBy(asc(epics.position), asc(epics.id), asc(stories.position), asc(stories.id));
  return rows.map(({ story: s, groupKey }) => ({
    key: s.key,
    title: s.title,
    groupKey,
    status: s.status,
    archived: s.archivedAt !== null,
    position: s.position,
    reference: s.reference,
  }));
}

/** One group with its description; null if there is no such group. */
export async function getGroup(db: AppDb, key: string): Promise<GroupDetail | null> {
  const { epics } = db.t;
  const [g] = await db.orm.select().from(epics).where(eq(epics.key, key)).limit(1);
  if (!g) return null;
  return { key: g.key, title: g.title, description: g.description, archived: g.archivedAt !== null };
}

/** One case with its full content; null if there is no such case. */
export async function getCase(db: AppDb, key: string): Promise<CaseDetail | null> {
  const { epics, stories } = db.t;
  const [r] = await db.orm
    .select({ story: stories, groupKey: epics.key })
    .from(stories)
    .innerJoin(epics, eq(epics.id, stories.epicId))
    .where(eq(stories.key, key))
    .limit(1);
  if (!r) return null;
  const s = r.story;
  return {
    key: s.key,
    groupKey: r.groupKey,
    title: s.title,
    description: s.description,
    acceptanceCriteria: decodeCriteria(s.criteria),
    reference: s.reference,
    status: s.status,
    archived: s.archivedAt !== null,
  };
}

/** The group and its non-archived cases in position order, as a sync file; null if there is no such group. */
export async function exportGroup(db: AppDb, key: string): Promise<SyncFile | null> {
  const { epics, stories } = db.t;
  const [group] = await db.orm.select().from(epics).where(eq(epics.key, key)).limit(1);
  if (!group) return null;
  const cases = await db.orm
    .select()
    .from(stories)
    .where(and(eq(stories.epicId, group.id), isNull(stories.archivedAt)))
    .orderBy(asc(stories.position), asc(stories.id));
  return {
    schemaVersion: 1,
    group: {
      key: group.key,
      title: group.title,
      ...(group.description !== null ? { description: group.description } : {}),
    },
    cases: cases.map((c) => ({
      key: c.key,
      title: c.title,
      description: c.description,
      acceptanceCriteria: decodeCriteria(c.criteria),
      ...(c.reference !== null ? { reference: c.reference } : {}),
    })),
  };
}
