import { asc, eq, max, type SQL } from "drizzle-orm";
import { lockSync, writeTx, type AppDb, type Tables, type Tx } from "@/lib/db";
import type { Failure } from "@/lib/errors";
import { changedFields, contentChangeEvent, type CaseContent, type ContentField } from "./content-change";
import { decodeCriteria, encodeCriteria } from "./criteria";
import {
  casePatchSchema,
  caseInputSchema,
  groupInputSchema,
  groupPatchSchema,
  type CaseInput,
  type GroupInput,
} from "./schema";

/** Who a content change is recorded as: the admin in the UI (`userId` set), the CLI actor otherwise. */
export type Writer = { userId: string | null; name: string };

type Done = { ok: true } | Failure;
type Direction = "up" | "down";
type CaseRow = Tables["stories"]["$inferSelect"];

const invalidInput: Failure = { ok: false, error: "invalidInput" };

/**
 * Writes the content and reference of `row`. If title, description or criteria changed, `contentVersion` goes up;
 * and if the case has been tested, it is flagged "Changed since tested" with one timeline event naming the fields.
 * Returns the changed content fields.
 */
export async function applyCaseContent(
  db: AppDb,
  tx: Tx,
  row: CaseRow,
  next: CaseContent & { reference: string | null },
  writer: Writer,
  now: Date,
): Promise<ContentField[]> {
  const { stories, storyEvents } = db.t;
  const title = next.title.trim();
  const fields = changedFields(
    { title: row.title, description: row.description, criteria: decodeCriteria(row.criteria) },
    { title, description: next.description, criteria: next.criteria },
  );
  if (fields.length === 0 && next.reference === row.reference) return fields;

  const flag = fields.length > 0 && row.status !== "untested";
  await tx
    .update(stories)
    .set({
      title,
      description: next.description,
      criteria: encodeCriteria(next.criteria),
      reference: next.reference,
      ...(fields.length > 0 ? { contentVersion: row.contentVersion + 1 } : {}),
      ...(flag ? { contentChangedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(stories.id, row.id));
  if (flag) {
    await tx.insert(storyEvents).values({
      storyId: row.id,
      userId: writer.userId,
      actorName: writer.name,
      fromStatus: null,
      toStatus: null,
      comment: contentChangeEvent(fields),
      createdAt: now,
    });
  }
  return fields;
}

async function findGroup(tx: Tx, t: Tables, key: string) {
  const [group] = await tx.select().from(t.epics).where(eq(t.epics.key, key)).limit(1);
  return group;
}

async function findCase(tx: Tx, t: Tables, key: string) {
  const [row] = await tx.select().from(t.stories).where(eq(t.stories.key, key)).limit(1);
  return row;
}

/** One past the last position, archived rows included, so positions stay distinct. */
export async function nextPosition(
  tx: Tx,
  column: Tables["epics"]["position"] | Tables["stories"]["position"],
  where?: SQL,
) {
  const [r] = await tx
    .select({ last: max(column) })
    .from(column.table)
    .where(where);
  return (r.last ?? -1) + 1;
}

/**
 * Swaps `id` with its non-archived neighbour; nothing at the ends. `rows` is every row in scope, archived ones
 * included, in (position, id) order. All of them are renumbered 0..n-1 in the new order, which also undoes equal
 * positions (a sync numbers only the file's cases, so they can tie with archived ones).
 */
async function swapWithNeighbour(
  rows: { id: number; position: number; archivedAt: Date | null }[],
  id: number,
  direction: Direction,
  setPosition: (id: number, position: number) => Promise<unknown>,
): Promise<void> {
  const active = rows.filter((r) => r.archivedAt === null);
  const i = active.findIndex((r) => r.id === id);
  const other = active[direction === "up" ? i - 1 : i + 1];
  if (i < 0 || !other) return;
  const order = [...rows];
  const a = order.indexOf(active[i]);
  const b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  for (const [position, r] of order.entries()) {
    if (r.position !== position) await setPosition(r.id, position);
  }
}

export function createGroup(db: AppDb, input: GroupInput): Promise<Done> {
  const parsed = groupInputSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(invalidInput);
  const { key, title, description } = parsed.data;
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    if (await findGroup(tx, t, key)) return { ok: false, error: "groupExists" };
    const position = await nextPosition(tx, t.epics.position);
    await tx.insert(t.epics).values({ key, title, description: description ?? null, position });
    return { ok: true };
  });
}

export function updateGroup(
  db: AppDb,
  key: string,
  patch: { title?: string; description?: string | null },
): Promise<Done> {
  const parsed = groupPatchSchema.safeParse(patch);
  if (!parsed.success) return Promise.resolve(invalidInput);
  const { title, description } = parsed.data;
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const group = await findGroup(tx, t, key);
    if (!group) return { ok: false, error: "groupNotFound" };
    await tx
      .update(t.epics)
      .set({
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.epics.id, group.id));
    return { ok: true };
  });
}

/** Archives or restores the group row only; the tree hides the cases of an archived group. */
export function setGroupArchived(db: AppDb, key: string, archived: boolean): Promise<Done> {
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const group = await findGroup(tx, t, key);
    if (!group) return { ok: false, error: "groupNotFound" };
    if ((group.archivedAt !== null) === archived) return { ok: true };
    const now = new Date();
    await tx
      .update(t.epics)
      .set({ archivedAt: archived ? now : null, updatedAt: now })
      .where(eq(t.epics.id, group.id));
    return { ok: true };
  });
}

export function moveGroup(db: AppDb, key: string, direction: Direction): Promise<Done> {
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const group = await findGroup(tx, t, key);
    if (!group) return { ok: false, error: "groupNotFound" };
    const rows = await tx
      .select({ id: t.epics.id, position: t.epics.position, archivedAt: t.epics.archivedAt })
      .from(t.epics)
      .orderBy(asc(t.epics.position), asc(t.epics.id));
    await swapWithNeighbour(rows, group.id, direction, (id, position) =>
      tx.update(t.epics).set({ position, updatedAt: new Date() }).where(eq(t.epics.id, id)),
    );
    return { ok: true };
  });
}

export function createCase(db: AppDb, groupKey: string, input: CaseInput): Promise<Done> {
  const parsed = caseInputSchema.safeParse(input);
  if (!parsed.success) return Promise.resolve(invalidInput);
  const { key, title, description, acceptanceCriteria, reference } = parsed.data;
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const group = await findGroup(tx, t, groupKey);
    if (!group) return { ok: false, error: "groupNotFound" };
    if (await findCase(tx, t, key)) return { ok: false, error: "caseExists" };
    const position = await nextPosition(tx, t.stories.position, eq(t.stories.epicId, group.id));
    await tx.insert(t.stories).values({
      key,
      epicId: group.id,
      title,
      description,
      criteria: encodeCriteria(acceptanceCriteria),
      reference: reference ?? null,
      position,
    });
    return { ok: true };
  });
}

/** A new `groupKey` moves the case to the end of that group. Returns the content fields that changed. */
export function updateCase(
  db: AppDb,
  key: string,
  patch: Partial<Omit<CaseInput, "key">> & { groupKey?: string },
  writer: Writer,
): Promise<{ ok: true; changed: ContentField[] } | Failure> {
  const parsed = casePatchSchema.safeParse(patch);
  if (!parsed.success) return Promise.resolve(invalidInput);
  const p = parsed.data;
  const t = db.t;
  return writeTx(db, async (tx): Promise<{ ok: true; changed: ContentField[] } | Failure> => {
    await lockSync(db, tx, "exclusive");
    const row = await findCase(tx, t, key);
    if (!row) return { ok: false, error: "caseNotFound" };
    const target = p.groupKey === undefined ? undefined : await findGroup(tx, t, p.groupKey);
    if (p.groupKey !== undefined && !target) return { ok: false, error: "groupNotFound" };

    const now = new Date();
    const changed = await applyCaseContent(
      db,
      tx,
      row,
      {
        title: p.title ?? row.title,
        description: p.description ?? row.description,
        criteria: p.acceptanceCriteria ?? decodeCriteria(row.criteria),
        reference: p.reference === undefined ? row.reference : p.reference || null,
      },
      writer,
      now,
    );
    if (target && target.id !== row.epicId) {
      const position = await nextPosition(tx, t.stories.position, eq(t.stories.epicId, target.id));
      await tx.update(t.stories).set({ epicId: target.id, position, updatedAt: now }).where(eq(t.stories.id, row.id));
    }
    return { ok: true, changed };
  });
}

export function setCaseArchived(db: AppDb, key: string, archived: boolean): Promise<Done> {
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const row = await findCase(tx, t, key);
    if (!row) return { ok: false, error: "caseNotFound" };
    if ((row.archivedAt !== null) === archived) return { ok: true };
    const now = new Date();
    // A sync may have given the archived case's position to another case: a restored one goes last.
    const position = archived
      ? row.position
      : await nextPosition(tx, t.stories.position, eq(t.stories.epicId, row.epicId));
    await tx
      .update(t.stories)
      .set({ archivedAt: archived ? now : null, position, updatedAt: now })
      .where(eq(t.stories.id, row.id));
    return { ok: true };
  });
}

export function moveCase(db: AppDb, key: string, direction: Direction): Promise<Done> {
  const t = db.t;
  return writeTx(db, async (tx): Promise<Done> => {
    await lockSync(db, tx, "exclusive");
    const row = await findCase(tx, t, key);
    if (!row) return { ok: false, error: "caseNotFound" };
    const rows = await tx
      .select({ id: t.stories.id, position: t.stories.position, archivedAt: t.stories.archivedAt })
      .from(t.stories)
      .where(eq(t.stories.epicId, row.epicId))
      .orderBy(asc(t.stories.position), asc(t.stories.id));
    await swapWithNeighbour(rows, row.id, direction, (id, position) =>
      tx.update(t.stories).set({ position, updatedAt: new Date() }).where(eq(t.stories.id, id)),
    );
    return { ok: true };
  });
}
