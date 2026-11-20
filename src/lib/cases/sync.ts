import { asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { lockSync, writeTx, type AppDb, type Tables } from "@/lib/db";
import { changedFields, type ContentField } from "./content-change";
import { decodeCriteria, encodeCriteria } from "./criteria";
import type { SyncFile } from "./schema";
import { applyCaseContent, nextPosition, type Writer } from "./write";

type GroupRow = Tables["epics"]["$inferSelect"];
type CaseRow = Tables["stories"]["$inferSelect"] & { groupKey: string };

export type SyncPlan = {
  group: { key: string; action: "created" | "updated" | "restored" | "unchanged" };
  created: string[];
  updated: { key: string; fields: ContentField[] }[];
  moved: { key: string; from: string }[];
  restored: string[];
  archived: string[];
  unchanged: string[];
};

/**
 * What a sync of `file` would do. `current.cases` holds every row whose key is in the file, in any group, and
 * every row of the file's group. Pure: reads nothing, writes nothing.
 */
export function planSync(current: { group: GroupRow | null; cases: CaseRow[] }, file: SyncFile): SyncPlan {
  const { group } = current;
  const byKey = new Map(current.cases.map((r) => [r.key, r]));
  const inFile = new Set(file.cases.map((c) => c.key));

  const plan: SyncPlan = {
    group: { key: file.group.key, action: groupAction(group, file.group) },
    created: [],
    updated: [],
    moved: [],
    restored: [],
    archived: [],
    unchanged: [],
  };

  file.cases.forEach((c, position) => {
    const row = byKey.get(c.key);
    if (!row) {
      plan.created.push(c.key);
      return;
    }
    const moved = row.groupKey !== file.group.key;
    const restored = row.archivedAt !== null;
    const fields = changedFields(
      { title: row.title, description: row.description, criteria: decodeCriteria(row.criteria) },
      { title: c.title, description: c.description, criteria: c.acceptanceCriteria },
    );
    const changed = fields.length > 0 || row.position !== position || row.reference !== (c.reference ?? null);
    if (moved) plan.moved.push({ key: c.key, from: row.groupKey });
    if (restored) plan.restored.push(c.key);
    if (changed) plan.updated.push({ key: c.key, fields });
    else if (!moved && !restored) plan.unchanged.push(c.key);
  });

  plan.archived = current.cases
    .filter((r) => r.groupKey === file.group.key && r.archivedAt === null && !inFile.has(r.key))
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((r) => r.key);
  return plan;
}

/** An absent description in the file and an empty or null one in the database are the same. */
function groupAction(group: GroupRow | null, input: SyncFile["group"]): SyncPlan["group"]["action"] {
  if (!group) return "created";
  if (group.archivedAt !== null) return "restored";
  return group.title !== input.title || (group.description || null) !== (input.description || null)
    ? "updated"
    : "unchanged";
}

/**
 * Makes the group in `file` match it, in one transaction: upserts the group and its cases by key, positions
 * from the file order, restores returning cases, archives the group's cases missing from the file. A case key
 * living in another group moves here. With `dryRun` the plan is returned before anything is written.
 */
export function syncGroup(db: AppDb, file: SyncFile, opts: { writer: Writer; dryRun?: boolean }): Promise<SyncPlan> {
  const { epics, stories } = db.t;
  return writeTx(db, async (tx) => {
    await lockSync(db, tx, "exclusive");
    const [existing] = await tx.select().from(epics).where(eq(epics.key, file.group.key)).limit(1);
    const keys = file.cases.map((c) => c.key);
    const scope: SQL[] = [];
    if (existing) scope.push(eq(stories.epicId, existing.id));
    if (keys.length > 0) scope.push(inArray(stories.key, keys));
    const rows =
      scope.length === 0
        ? []
        : await tx
            .select({ story: stories, groupKey: epics.key })
            .from(stories)
            .innerJoin(epics, eq(epics.id, stories.epicId))
            .where(or(...scope))
            .orderBy(asc(stories.id));
    const cases = rows.map((r) => ({ ...r.story, groupKey: r.groupKey }));

    const plan = planSync({ group: existing ?? null, cases }, file);
    if (opts.dryRun) return plan;

    const now = new Date();
    const description = file.group.description ?? null;
    let groupId: number;
    if (!existing) {
      const position = await nextPosition(tx, epics.position);
      [{ id: groupId }] = await tx
        .insert(epics)
        .values({ key: file.group.key, title: file.group.title, description, position })
        .returning({ id: epics.id });
    } else {
      groupId = existing.id;
      if (plan.group.action !== "unchanged") {
        await tx
          .update(epics)
          .set({ title: file.group.title, description, archivedAt: null, updatedAt: now })
          .where(eq(epics.id, groupId));
      }
    }

    const byKey = new Map(cases.map((r) => [r.key, r]));
    for (const [position, c] of file.cases.entries()) {
      const row = byKey.get(c.key);
      if (!row) {
        await tx.insert(stories).values({
          key: c.key,
          epicId: groupId,
          title: c.title,
          description: c.description,
          criteria: encodeCriteria(c.acceptanceCriteria),
          reference: c.reference ?? null,
          position,
        });
        continue;
      }
      await applyCaseContent(
        db,
        tx,
        row,
        { title: c.title, description: c.description, criteria: c.acceptanceCriteria, reference: c.reference ?? null },
        opts.writer,
        now,
      );
      if (row.epicId !== groupId || row.position !== position || row.archivedAt !== null) {
        await tx
          .update(stories)
          .set({ epicId: groupId, position, archivedAt: null, updatedAt: now })
          .where(eq(stories.id, row.id));
      }
    }

    const archived = new Set(plan.archived);
    for (const row of cases) {
      if (!archived.has(row.key)) continue;
      await tx.update(stories).set({ archivedAt: now, updatedAt: now }).where(eq(stories.id, row.id));
    }
    return plan;
  });
}
