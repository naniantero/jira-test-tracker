import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../helpers/test-db";
import { exportGroup, parseSyncFile, setGroupArchived, syncGroup, type SyncFile, type Writer } from "@/lib/cases";
import type { AppDb } from "@/lib/db";

const writer: Writer = { userId: null, name: "Agent" };

const c = (key: string, extra: Partial<SyncFile["cases"][number]> = {}): SyncFile["cases"][number] => ({
  key,
  title: `Title ${key}`,
  description: "",
  acceptanceCriteria: [],
  ...extra,
});
const file = (cases: SyncFile["cases"], group: SyncFile["group"] = { key: "G", title: "Group" }): SyncFile => ({
  schemaVersion: 1,
  group,
  cases,
});

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
});

const sync = (f: SyncFile, opts: { dryRun?: boolean } = {}) => syncGroup(db, f, { writer, ...opts });
async function row(key: string) {
  const [r] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, key)).limit(1);
  return r;
}
const setStatus = (key: string, status: "passed" | "failed") =>
  db.orm.update(db.t.stories).set({ status }).where(eq(db.t.stories.key, key));
const events = (key: string) =>
  db.orm
    .select()
    .from(db.t.storyEvents)
    .innerJoin(db.t.stories, eq(db.t.stories.id, db.t.storyEvents.storyId))
    .where(eq(db.t.stories.key, key))
    .then((rows) => rows.map((r) => r.story_events));
const eventCount = async () => (await db.orm.select({ n: count() }).from(db.t.storyEvents))[0].n;
const dump = async () => ({
  epics: await db.orm.select().from(db.t.epics),
  stories: await db.orm.select().from(db.t.stories),
  events: await db.orm.select().from(db.t.storyEvents),
});

const empty = { created: [], updated: [], moved: [], restored: [], archived: [], unchanged: [] };

describe("syncGroup", () => {
  it("creates a new group and its cases in file order", async () => {
    const plan = await sync(file([c("A"), c("B", { reference: "PROJ-1", acceptanceCriteria: ["x"] })]));
    expect(plan).toEqual({ ...empty, group: { key: "G", action: "created" }, created: ["A", "B"] });
    expect(await row("A")).toMatchObject({ position: 0, status: "untested", contentVersion: 1 });
    expect(await row("B")).toMatchObject({ position: 1, reference: "PROJ-1" });
    expect(await exportGroup(db, "G")).toEqual(
      file([c("A"), c("B", { reference: "PROJ-1", acceptanceCriteria: ["x"] })]),
    );
  });

  it("puts a new group after the existing ones", async () => {
    await sync(file([c("A")]));
    await sync(file([c("B")], { key: "H", title: "Other" }));
    const groups = await db.orm.select().from(db.t.epics);
    expect(groups.map((g) => [g.key, g.position])).toEqual([
      ["G", 0],
      ["H", 1],
    ]);
  });

  it("changes nothing on an identical second run", async () => {
    const f = file([c("A"), c("B")], { key: "G", title: "Group", description: "About" });
    await sync(f);
    await setStatus("A", "passed");
    const before = await dump();
    expect(await sync(f)).toEqual({ ...empty, group: { key: "G", action: "unchanged" }, unchanged: ["A", "B"] });
    expect(await dump()).toEqual(before);
  });

  it("treats a missing group description and an empty stored one as equal", async () => {
    await sync(file([c("A")], { key: "G", title: "Group", description: "" }));
    expect((await sync(file([c("A")]))).group.action).toBe("unchanged");
    await sync(file([c("A")], { key: "G", title: "Group", description: "Now" }));
    expect((await db.orm.select().from(db.t.epics))[0].description).toBe("Now");
    expect((await sync(file([c("A")]))).group.action).toBe("updated");
    expect((await db.orm.select().from(db.t.epics))[0].description).toBeNull();
  });

  it("archives cases missing from the file, keeping status and events, and restores them with their status", async () => {
    await sync(file([c("A"), c("B")]));
    await setStatus("B", "passed");
    await db.orm.insert(db.t.storyEvents).values({ storyId: (await row("B")).id, actorName: "T", comment: "ok" });

    const plan = await sync(file([c("A")]));
    expect(plan).toEqual({ ...empty, group: { key: "G", action: "unchanged" }, archived: ["B"], unchanged: ["A"] });
    expect(await row("B")).toMatchObject({ status: "passed" });
    expect((await row("B")).archivedAt).not.toBeNull();
    expect(await events("B")).toHaveLength(1);

    const back = await sync(file([c("A"), c("B")]));
    expect(back).toEqual({ ...empty, group: { key: "G", action: "unchanged" }, restored: ["B"], unchanged: ["A"] });
    expect(await row("B")).toMatchObject({ status: "passed", archivedAt: null, position: 1 });
    expect(await events("B")).toHaveLength(1);
  });

  it("an empty file archives all of the group's cases", async () => {
    await sync(file([c("A"), c("B")]));
    expect((await sync(file([]))).archived).toEqual(["A", "B"]);
  });

  it("moves a case, even an archived one, from another group, keeping its timeline", async () => {
    await sync(file([c("X"), c("Y")], { key: "H", title: "Other" }));
    await setStatus("X", "failed");
    await db.orm.insert(db.t.storyEvents).values({ storyId: (await row("X")).id, actorName: "T", comment: "bad" });
    await sync(file([c("Y")], { key: "H", title: "Other" }));
    expect((await row("X")).archivedAt).not.toBeNull();

    const plan = await sync(file([c("W"), c("X")]));
    expect(plan).toEqual({
      ...empty,
      group: { key: "G", action: "created" },
      created: ["W"],
      moved: [{ key: "X", from: "H" }],
      restored: ["X"],
      updated: [{ key: "X", fields: [] }],
    });
    const [g] = await db.orm.select().from(db.t.epics).where(eq(db.t.epics.key, "G"));
    expect(await row("X")).toMatchObject({ epicId: g.id, status: "failed", archivedAt: null, position: 1 });
    expect(await events("X")).toHaveLength(1);
    expect((await row("Y")).archivedAt).toBeNull();
  });

  it("never archives another group's cases, and a move that keeps the position is only moved", async () => {
    await sync(file([c("X", { title: "T" })], { key: "H", title: "Other" }));
    await sync(file([c("A")]));
    const plan = await sync(file([c("X", { title: "T" }), c("A")]));
    // X sits at position 0 in both groups, so only the move is reported.
    expect(plan).toEqual({
      ...empty,
      group: { key: "G", action: "unchanged" },
      moved: [{ key: "X", from: "H" }],
      updated: [{ key: "A", fields: [] }],
    });
    expect(await exportGroup(db, "H")).toEqual(file([], { key: "H", title: "Other" }));
  });

  it("flags a tested case whose title changes, with the writer as actor", async () => {
    await sync(file([c("A")]));
    await setStatus("A", "failed");
    const plan = await sync(file([c("A", { title: "New" })]));
    expect(plan.updated).toEqual([{ key: "A", fields: ["title"] }]);
    expect(await row("A")).toMatchObject({ title: "New", status: "failed", contentVersion: 2 });
    expect((await row("A")).contentChangedAt).not.toBeNull();
    const ev = await events("A");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ comment: "Changed: title.", actorName: "Agent", userId: null });
  });

  it("changes an untested case silently and reports a reference or position change with no fields", async () => {
    await sync(file([c("A"), c("B")]));
    const plan = await sync(file([c("B"), c("A", { reference: "R" })]));
    expect(plan.updated).toEqual([
      { key: "B", fields: [] },
      { key: "A", fields: [] },
    ]);
    expect(plan.unchanged).toEqual([]);
    expect(await row("B")).toMatchObject({ position: 0, contentVersion: 1 });
    expect(await row("A")).toMatchObject({ position: 1, reference: "R", contentVersion: 1 });
    expect(await eventCount()).toBe(0);
    const silent = await sync(file([c("B"), c("A", { reference: "R", description: "d", acceptanceCriteria: ["k"] })]));
    expect(silent.updated).toEqual([{ key: "A", fields: ["description", "acceptance criteria"] }]);
    expect(await eventCount()).toBe(0);
    expect(await row("A")).toMatchObject({ contentVersion: 2, contentChangedAt: null });
  });

  it("reports CRLF text matching LF-stored content as unchanged", async () => {
    await sync(
      file([c("A", { description: "Steps:\n1. Open", acceptanceCriteria: ["One\ntwo"] })], {
        key: "G",
        title: "Group",
        description: "About\nit",
      }),
    );
    await setStatus("A", "passed");
    const parsed = parseSyncFile({
      schemaVersion: 1,
      group: { key: "G", title: "Group", description: "About\r\nit" },
      cases: [{ key: "A", title: "Title A", description: "Steps:\r\n1. Open", acceptanceCriteria: ["One\r\ntwo"] }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(await sync(parsed.file)).toEqual({ ...empty, group: { key: "G", action: "unchanged" }, unchanged: ["A"] });
    expect(await eventCount()).toBe(0);
  });

  it("restores an archived group and applies its title and description", async () => {
    await sync(file([c("A")]));
    await setGroupArchived(db, "G", true);
    const plan = await sync(file([c("A")], { key: "G", title: "Back", description: "D" }));
    expect(plan.group).toEqual({ key: "G", action: "restored" });
    const [g] = await db.orm.select().from(db.t.epics);
    expect(g).toMatchObject({ title: "Back", description: "D", archivedAt: null });
  });

  it("dry run returns the plan of the real run and writes nothing", async () => {
    await sync(file([c("A"), c("B"), c("X")], { key: "H", title: "Other" }));
    await sync(file([c("A"), c("B")]));
    await setStatus("A", "passed");
    const next = file([c("X"), c("A", { title: "Changed" }), c("N")], { key: "G", title: "Renamed" });

    const before = await dump();
    const dry = await sync(next, { dryRun: true });
    expect(await dump()).toEqual(before);
    expect(dry.archived).toEqual(["B"]);
    expect(await sync(next)).toEqual(dry);
    expect(await dump()).not.toEqual(before);
  });

  it("round-trips an export as all unchanged", async () => {
    await sync(
      file([c("A", { description: "d", acceptanceCriteria: ["1", "2"], reference: "R" }), c("B")], {
        key: "G",
        title: "Group",
        description: "About",
      }),
    );
    const exported = await exportGroup(db, "G");
    expect(exported).not.toBeNull();
    const before = await dump();
    expect(await sync(exported!)).toEqual({
      ...empty,
      group: { key: "G", action: "unchanged" },
      unchanged: ["A", "B"],
    });
    expect(await dump()).toEqual(before);
  });
});
