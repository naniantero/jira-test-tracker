import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { decodeCriteria } from "@/lib/cases/criteria";
import type { AppDb } from "@/lib/db";
import { computeProgress, type ProgressCounts } from "./progress";
import type { StoryStatus } from "./status";

export type TreeFilter = "all" | "untested" | "issues" | "retest" | "changed";

export type StoryListItem = {
  id: number;
  key: string;
  title: string;
  status: StoryStatus;
  statusChangedAt: Date | null;
  statusChangedByName: string | null;
  contentChangedAt: Date | null;
  contentVersion: number;
};

export type EpicNode = {
  id: number;
  key: string;
  title: string;
  progress: ProgressCounts;
  stories: StoryListItem[];
};

export type ProjectTree = {
  overall: ProgressCounts;
  tabCounts: Record<TreeFilter, number>;
  epics: EpicNode[];
};

export type TimelineEvent = {
  id: number;
  actorName: string;
  fromStatus: StoryStatus | null;
  toStatus: StoryStatus | null;
  comment: string | null;
  createdAt: Date;
  attachments: { id: string; originalName: string; mimeType: string; sizeBytes: number }[];
};

/** A story's structure, status and timeline. */
export type StoryRecord = Omit<StoryListItem, "title"> & {
  epicKey: string;
  /** The story or its epic is archived. */
  archived: boolean;
  timeline: TimelineEvent[];
};

/** A story for the sheet: the record plus its content. */
export type StoryDetail = StoryRecord & {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  reference: string | null;
  epicTitle: string;
};

const matches = (f: TreeFilter, s: StoryListItem): boolean => {
  switch (f) {
    case "all":
      return true;
    case "untested":
      return s.status === "untested";
    case "issues":
      return s.status === "failed";
    case "retest":
      return s.status === "retest";
    case "changed":
      return s.contentChangedAt !== null;
  }
};

/** The tree of non-archived epics and stories; an epic without any non-archived story is left out. */
export async function getProjectTree(db: AppDb, filter: TreeFilter): Promise<ProjectTree> {
  const { epics, stories } = db.t;
  const epicRows = await db.orm
    .select()
    .from(epics)
    .where(isNull(epics.archivedAt))
    .orderBy(asc(epics.position), asc(epics.id));
  const storyRows = await db.orm
    .select({
      id: stories.id,
      epicId: stories.epicId,
      key: stories.key,
      title: stories.title,
      status: stories.status,
      statusChangedAt: stories.statusChangedAt,
      statusChangedByName: stories.statusChangedByName,
      contentChangedAt: stories.contentChangedAt,
      contentVersion: stories.contentVersion,
    })
    .from(stories)
    .where(isNull(stories.archivedAt))
    .orderBy(asc(stories.position), asc(stories.id));

  const byEpic = new Map<number, (StoryListItem & { epicId: number })[]>();
  for (const s of storyRows) {
    const list = byEpic.get(s.epicId) ?? [];
    list.push(s);
    byEpic.set(s.epicId, list);
  }

  const tabCounts: Record<TreeFilter, number> = { all: 0, untested: 0, issues: 0, retest: 0, changed: 0 };
  const nodes: EpicNode[] = [];
  const allStatuses: StoryStatus[] = [];
  for (const e of epicRows) {
    const all = byEpic.get(e.id) ?? [];
    if (all.length === 0) continue;
    for (const s of all) {
      allStatuses.push(s.status);
      for (const f of Object.keys(tabCounts) as TreeFilter[]) if (matches(f, s)) tabCounts[f] += 1;
    }
    const visible = all.filter((s) => matches(filter, s)).map(({ epicId: _epicId, ...item }) => item);
    if (filter !== "all" && visible.length === 0) continue;
    nodes.push({
      id: e.id,
      key: e.key,
      title: e.title,
      progress: computeProgress(all.map((s) => s.status)),
      stories: visible,
    });
  }
  return { overall: computeProgress(allStatuses), tabCounts, epics: nodes };
}

export async function getStoryByKey(db: AppDb, key: string): Promise<StoryDetail | null> {
  const { attachments, epics, stories, storyEvents } = db.t;
  const [r] = await db.orm
    .select({ s: stories, epicKey: epics.key, epicTitle: epics.title, epicArchivedAt: epics.archivedAt })
    .from(stories)
    .innerJoin(epics, eq(stories.epicId, epics.id))
    .where(eq(stories.key, key))
    .limit(1);
  if (!r) return null;
  const events = await db.orm
    .select()
    .from(storyEvents)
    .where(eq(storyEvents.storyId, r.s.id))
    .orderBy(desc(storyEvents.createdAt), desc(storyEvents.id));
  const files = events.length
    ? await db.orm
        .select()
        .from(attachments)
        .where(
          inArray(
            attachments.eventId,
            events.map((e) => e.id),
          ),
        )
        .orderBy(asc(attachments.position))
    : [];
  const timeline: TimelineEvent[] = events.map((e) => ({
    id: e.id,
    actorName: e.actorName,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    comment: e.comment,
    createdAt: e.createdAt,
    attachments: files
      .filter((f) => f.eventId === e.id)
      .map((f) => ({ id: f.id, originalName: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes })),
  }));
  const s = r.s;
  return {
    id: s.id,
    key: s.key,
    status: s.status,
    statusChangedAt: s.statusChangedAt,
    statusChangedByName: s.statusChangedByName,
    contentChangedAt: s.contentChangedAt,
    contentVersion: s.contentVersion,
    epicKey: r.epicKey,
    archived: s.archivedAt !== null || r.epicArchivedAt !== null,
    timeline,
    title: s.title,
    description: s.description,
    acceptanceCriteria: decodeCriteria(s.criteria),
    reference: s.reference,
    epicTitle: r.epicTitle,
  };
}
