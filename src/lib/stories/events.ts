import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { StoredFile } from "@/lib/attachments/storage";
import { lockEpicRow, lockSync, writeTx, type AppDb, type Tables, type Tx } from "@/lib/db";
import type { Failure } from "@/lib/errors";
import { computeProgress, isComplete } from "./progress";
import { checkTransition, type Role, type StoryStatus } from "./status";

export const MAX_COMMENT_LENGTH = 5000;

type Actor = { id: string; name: string; role: Role };

export type RecordEventInput = {
  storyKey: string;
  actor: Actor;
  expectedStatus: StoryStatus;
  /** The content version the caller saw; only checked for a status change, never for a comment. */
  expectedContentVersion: number;
  toStatus: StoryStatus | null;
  comment: string | null;
  files: StoredFile[];
};

export type RecordEventResult =
  { ok: true; eventId: number; epicCompleted: { key: string; title: string } | null } | Failure;

type StatusPatch = {
  status: StoryStatus;
  statusChangedAt: Date;
  statusChangedByName: string;
};

async function epicComplete(tx: Tx, t: Tables, epicId: number): Promise<boolean> {
  const rows = await tx
    .select({ status: t.stories.status })
    .from(t.stories)
    .where(and(eq(t.stories.epicId, epicId), isNull(t.stories.archivedAt)));
  return isComplete(computeProgress(rows.map((r) => r.status)));
}

/**
 * Sets the story's status only if it still is `expected`, its content is still at `expectedContentVersion`
 * and the story is not archived, and clears the "Changed since tested" marker. Returns whether the row
 * changed: `false` means someone else moved it or edited its content first.
 * `updatedAt` takes `statusChangedAt`, so both record the same moment.
 */
export async function updateStatusIfCurrent(
  db: AppDb,
  tx: Tx,
  storyId: number,
  expected: StoryStatus,
  expectedContentVersion: number,
  patch: StatusPatch,
): Promise<boolean> {
  const { stories } = db.t;
  const rows = await tx
    .update(stories)
    .set({ ...patch, contentChangedAt: null, updatedAt: patch.statusChangedAt })
    .where(
      and(
        eq(stories.id, storyId),
        eq(stories.status, expected),
        eq(stories.contentVersion, expectedContentVersion),
        isNull(stories.archivedAt),
      ),
    )
    .returning({ id: stories.id });
  return rows.length > 0;
}

/**
 * Records a status change and/or comment with attachments. Lock order: the sync lock (shared), then,
 * for a status change, the epic row, then the conditional story update; the status change is applied
 * before any insert so that a stale one writes nothing.
 */
export function recordStoryEvent(db: AppDb, i: RecordEventInput): Promise<RecordEventResult> {
  const t = db.t;
  return writeTx(db, async (tx): Promise<RecordEventResult> => {
    await lockSync(db, tx, "shared");
    const [found] = await tx
      .select({ story: t.stories, epicArchivedAt: t.epics.archivedAt })
      .from(t.stories)
      .innerJoin(t.epics, eq(t.epics.id, t.stories.epicId))
      .where(eq(t.stories.key, i.storyKey))
      .limit(1);
    if (!found) return { ok: false, error: "storyNotFound" };
    const { story } = found;
    if (story.archivedAt || found.epicArchivedAt) return { ok: false, error: "storyArchived" };
    // Fast path; the conditional update below is the real check. A comment-only event overwrites
    // nothing, so it is fine from a sheet showing an older status or text. `contentChanged` wins over
    // `staleStatus`: reloading fixes both.
    if (i.toStatus !== null) {
      if (story.contentVersion !== i.expectedContentVersion) return { ok: false, error: "contentChanged" };
      if (story.status !== i.expectedStatus) return { ok: false, error: "staleStatus" };
    }
    const comment = (i.comment ?? "").trim() || null;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      return { ok: false, error: "commentTooLong", values: { max: MAX_COMMENT_LENGTH } };
    }
    if (i.toStatus === null) {
      if (!comment && i.files.length === 0) {
        return { ok: false, error: "commentOrFile" };
      }
    } else {
      const check = checkTransition({ from: story.status, to: i.toStatus, role: i.actor.role, comment });
      if (!check.ok) return check;
    }

    const now = new Date();
    let wasComplete = false;
    if (i.toStatus !== null) {
      // Serializes status changes within the epic, so exactly one of them sees it become complete.
      await lockEpicRow(db, tx, story.epicId);
      wasComplete = await epicComplete(tx, t, story.epicId);
      const changed = await updateStatusIfCurrent(db, tx, story.id, story.status, i.expectedContentVersion, {
        status: i.toStatus,
        statusChangedAt: now,
        statusChangedByName: i.actor.name,
      });
      if (!changed) {
        // The read above predates the epic lock, so another writer got in between; re-read for the cause.
        const [current] = await tx
          .select({ contentVersion: t.stories.contentVersion })
          .from(t.stories)
          .where(eq(t.stories.id, story.id))
          .limit(1);
        const contentMoved = current?.contentVersion !== i.expectedContentVersion;
        return { ok: false, error: contentMoved ? "contentChanged" : "staleStatus" };
      }
    }

    const [event] = await tx
      .insert(t.storyEvents)
      .values({
        storyId: story.id,
        userId: i.actor.id,
        actorName: i.actor.name,
        fromStatus: i.toStatus === null ? null : story.status,
        toStatus: i.toStatus,
        comment,
        createdAt: now,
      })
      .returning({ id: t.storyEvents.id });
    if (i.files.length > 0) {
      await tx.insert(t.attachments).values(
        i.files.map((f, position) => ({
          id: randomUUID(),
          eventId: event.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          storageName: f.storageName,
          position,
          createdAt: now,
        })),
      );
    }
    let epicCompleted: { key: string; title: string } | null = null;
    if (i.toStatus !== null && !wasComplete && (await epicComplete(tx, t, story.epicId))) {
      const [e] = await tx
        .select({ key: t.epics.key, title: t.epics.title })
        .from(t.epics)
        .where(eq(t.epics.id, story.epicId))
        .limit(1);
      epicCompleted = e;
    }
    return { ok: true, eventId: event.id, epicCompleted };
  });
}

/**
 * Clears the "Changed since tested" marker and logs that the status was kept. The conditional update runs
 * before the insert, so a status change that cleared the marker first (even after the read) writes nothing.
 */
export async function dismissContentChange(
  db: AppDb,
  i: { storyKey: string; actor: Actor },
): Promise<{ ok: true } | Failure> {
  if (i.actor.role !== "admin") return { ok: false, error: "notAllowed" };
  const t = db.t;
  return writeTx(db, async (tx): Promise<{ ok: true } | Failure> => {
    await lockSync(db, tx, "shared");
    const [story] = await tx
      .select({ id: t.stories.id, archivedAt: t.stories.archivedAt, epicArchivedAt: t.epics.archivedAt })
      .from(t.stories)
      .innerJoin(t.epics, eq(t.epics.id, t.stories.epicId))
      .where(eq(t.stories.key, i.storyKey))
      .limit(1);
    if (!story) return { ok: false, error: "storyNotFound" };
    if (story.archivedAt || story.epicArchivedAt) return { ok: false, error: "storyArchived" };
    const now = new Date();
    const cleared = await tx
      .update(t.stories)
      .set({ contentChangedAt: null, updatedAt: now })
      .where(and(eq(t.stories.id, story.id), isNotNull(t.stories.contentChangedAt)))
      .returning({ id: t.stories.id });
    if (cleared.length === 0) return { ok: false, error: "nothingToReview" };
    await tx.insert(t.storyEvents).values({
      storyId: story.id,
      userId: i.actor.id,
      actorName: i.actor.name,
      fromStatus: null,
      toStatus: null,
      comment: "Content change reviewed; status kept.",
      createdAt: now,
    });
    return { ok: true };
  });
}
