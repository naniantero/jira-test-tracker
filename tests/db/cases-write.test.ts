import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_STRUCTURE, seedStructure } from "../helpers/seed";
import { createTestDb } from "../helpers/test-db";
import {
  createCase,
  createGroup,
  decodeCriteria,
  encodeCriteria,
  exportGroup,
  listCases,
  listGroups,
  moveCase,
  moveGroup,
  setCaseArchived,
  setGroupArchived,
  updateCase,
  updateGroup,
  type Writer,
} from "@/lib/cases";
import type { AppDb } from "@/lib/db";

const writer: Writer = { userId: null, name: "CLI" };

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedStructure(db, BASE_STRUCTURE);
});

async function row(key: string) {
  const [r] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, key)).limit(1);
  return r;
}
const setRow = (key: string, v: Partial<AppDb["t"]["stories"]["$inferInsert"]>) =>
  db.orm.update(db.t.stories).set(v).where(eq(db.t.stories.key, key));
const events = (key: string) =>
  db.orm
    .select()
    .from(db.t.storyEvents)
    .innerJoin(db.t.stories, eq(db.t.stories.id, db.t.storyEvents.storyId))
    .where(eq(db.t.stories.key, key))
    .then((rows) => rows.map((r) => r.story_events));
const caseKeys = async (groupKey: string) => (await listCases(db, { groupKey })).map((c) => c.key);

describe("createGroup", () => {
  it("adds the group last and rejects a duplicate key", async () => {
    expect(await createGroup(db, { key: "G", title: " New " })).toEqual({ ok: true });
    expect((await listGroups(db, {})).map((g) => g.key)).toEqual(["PROJ-1", "PROJ-2", "G"]);
    expect((await listGroups(db, {}))[2]).toMatchObject({ title: "New", position: 2, archived: false });
    expect(await createGroup(db, { key: "G", title: "Again" })).toEqual({ ok: false, error: "groupExists" });
  });

  it("rejects invalid input", async () => {
    expect(await createGroup(db, { key: "-x", title: "T" })).toEqual({ ok: false, error: "invalidInput" });
    expect(await createGroup(db, { key: "G", title: " " })).toEqual({ ok: false, error: "invalidInput" });
  });
});

describe("updateGroup and setGroupArchived", () => {
  it("updates title and description, and clears the description with null", async () => {
    expect(await updateGroup(db, "PROJ-1", { title: "Renamed", description: "About" })).toEqual({ ok: true });
    expect((await exportGroup(db, "PROJ-1"))?.group).toEqual({ key: "PROJ-1", title: "Renamed", description: "About" });
    await updateGroup(db, "PROJ-1", { description: null });
    expect((await exportGroup(db, "PROJ-1"))?.group).toEqual({ key: "PROJ-1", title: "Renamed" });
  });

  it("stores a group description's line breaks as LF", async () => {
    await updateGroup(db, "PROJ-1", { description: "a\r\nb" });
    expect((await exportGroup(db, "PROJ-1"))?.group.description).toBe("a\nb");
  });

  it("reports an unknown group and invalid input", async () => {
    expect(await updateGroup(db, "nope", { title: "T" })).toEqual({ ok: false, error: "groupNotFound" });
    expect(await updateGroup(db, "PROJ-1", { title: "" })).toEqual({ ok: false, error: "invalidInput" });
  });

  it("archives only the group row and restores it", async () => {
    expect(await setGroupArchived(db, "PROJ-1", true)).toEqual({ ok: true });
    expect((await listGroups(db, { archived: true })).map((g) => g.key)).toEqual(["PROJ-1"]);
    expect((await listGroups(db, { archived: false })).map((g) => g.key)).toEqual(["PROJ-2"]);
    expect((await row("PROJ-11")).archivedAt).toBeNull();
    await setGroupArchived(db, "PROJ-1", false);
    expect(await listGroups(db, { archived: true })).toEqual([]);
    expect(await setGroupArchived(db, "nope", true)).toEqual({ ok: false, error: "groupNotFound" });
  });
});

describe("moveGroup", () => {
  it("swaps with the neighbour among non-archived groups", async () => {
    await createGroup(db, { key: "G3", title: "G3" });
    await setGroupArchived(db, "PROJ-2", true);
    expect(await moveGroup(db, "G3", "up")).toEqual({ ok: true });
    expect((await listGroups(db, { archived: false })).map((g) => g.key)).toEqual(["G3", "PROJ-1"]);
  });

  it("moves a group whose position ties with another", async () => {
    await db.orm.update(db.t.epics).set({ position: 0 });
    await moveGroup(db, "PROJ-2", "up");
    expect((await listGroups(db, {})).map((g) => [g.key, g.position])).toEqual([
      ["PROJ-2", 0],
      ["PROJ-1", 1],
    ]);
  });

  it("is a no-op at the ends", async () => {
    expect(await moveGroup(db, "PROJ-1", "up")).toEqual({ ok: true });
    expect(await moveGroup(db, "PROJ-2", "down")).toEqual({ ok: true });
    expect((await listGroups(db, {})).map((g) => g.key)).toEqual(["PROJ-1", "PROJ-2"]);
    expect(await moveGroup(db, "nope", "up")).toEqual({ ok: false, error: "groupNotFound" });
  });
});

describe("createCase", () => {
  const input = { key: "C-1", title: "Case", description: "", acceptanceCriteria: ["a"], reference: "PROJ-1" };

  it("adds the case last in its group with version 1", async () => {
    expect(await createCase(db, "PROJ-1", input)).toEqual({ ok: true });
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-11", "PROJ-12", "C-1"]);
    const r = await row("C-1");
    expect(r).toMatchObject({ position: 2, status: "untested", contentVersion: 1, reference: "PROJ-1" });
    expect(decodeCriteria(r.criteria)).toEqual(["a"]);
  });

  it("fails on a missing group, a duplicate key and invalid input", async () => {
    expect(await createCase(db, "nope", input)).toEqual({ ok: false, error: "groupNotFound" });
    expect(await createCase(db, "PROJ-1", { ...input, key: "PROJ-21" })).toEqual({ ok: false, error: "caseExists" });
    expect(await createCase(db, "PROJ-1", { ...input, title: "" })).toEqual({ ok: false, error: "invalidInput" });
    expect(await row("C-1")).toBeUndefined();
  });
});

describe("updateCase", () => {
  const eventCount = async () => (await db.orm.select({ n: count() }).from(db.t.storyEvents))[0].n;

  it("changes an untested case silently and bumps the content version", async () => {
    const r = await updateCase(db, "PROJ-11", { title: " New title ", acceptanceCriteria: ["x", " "] }, writer);
    expect(r).toEqual({ ok: true, changed: ["title", "acceptance criteria"] });
    const s = await row("PROJ-11");
    expect(s).toMatchObject({ title: "New title", contentVersion: 2, contentChangedAt: null });
    expect(decodeCriteria(s.criteria)).toEqual(["x"]);
    expect(await eventCount()).toBe(0);
  });

  it("flags a tested case once and names the writer", async () => {
    await setRow("PROJ-11", { status: "passed" });
    const r = await updateCase(db, "PROJ-11", { description: "More" }, { userId: null, name: "Agent" });
    expect(r).toEqual({ ok: true, changed: ["description"] });
    const s = await row("PROJ-11");
    expect(s.contentChangedAt).not.toBeNull();
    expect(s.status).toBe("passed");
    const ev = await events("PROJ-11");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ comment: "Changed: description.", actorName: "Agent", userId: null });
  });

  it("does not flag or bump when nothing changes", async () => {
    await setRow("PROJ-11", { status: "passed" });
    const r = await updateCase(db, "PROJ-11", { title: "PROJ-11 " }, writer);
    expect(r).toEqual({ ok: true, changed: [] });
    expect(await row("PROJ-11")).toMatchObject({ contentVersion: 1, contentChangedAt: null });
    expect(await eventCount()).toBe(0);
  });

  it("treats CRLF line breaks as the stored LF ones", async () => {
    await setRow("PROJ-11", {
      status: "passed",
      description: "Steps:\n1. Open",
      criteria: encodeCriteria(["One\ntwo"]),
    });
    const r = await updateCase(
      db,
      "PROJ-11",
      { title: "PROJ-11", description: "Steps:\r\n1. Open", acceptanceCriteria: ["One\r\ntwo", "\r\n"] },
      writer,
    );
    expect(r).toEqual({ ok: true, changed: [] });
    expect(await row("PROJ-11")).toMatchObject({ contentVersion: 1, contentChangedAt: null });
    expect(await eventCount()).toBe(0);
  });

  it("stores line breaks as LF", async () => {
    await updateCase(db, "PROJ-11", { description: "a\r\nb\rc", acceptanceCriteria: ["x\r\ny"] }, writer);
    const s = await row("PROJ-11");
    expect(s.description).toBe("a\nb\nc");
    expect(decodeCriteria(s.criteria)).toEqual(["x\ny"]);
  });

  it("flags nothing for a reference or group change", async () => {
    await setRow("PROJ-11", { status: "passed" });
    expect(await updateCase(db, "PROJ-11", { reference: " PROJ-9 " }, writer)).toEqual({ ok: true, changed: [] });
    expect(await updateCase(db, "PROJ-11", { groupKey: "PROJ-2" }, writer)).toEqual({ ok: true, changed: [] });
    expect(await row("PROJ-11")).toMatchObject({ reference: "PROJ-9", contentVersion: 1, contentChangedAt: null });
    expect(await eventCount()).toBe(0);
    expect(await updateCase(db, "PROJ-11", { reference: "" }, writer)).toEqual({ ok: true, changed: [] });
    expect((await row("PROJ-11")).reference).toBeNull();
  });

  it("moves a case to the end of the target group and keeps its status", async () => {
    await setRow("PROJ-11", { status: "failed" });
    await updateCase(db, "PROJ-11", { groupKey: "PROJ-2" }, writer);
    expect(await caseKeys("PROJ-2")).toEqual(["PROJ-21", "PROJ-11"]);
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-12"]);
    expect((await row("PROJ-11")).status).toBe("failed");
  });

  it("keeps the position when the group is the current one", async () => {
    await updateCase(db, "PROJ-11", { groupKey: "PROJ-1" }, writer);
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-11", "PROJ-12"]);
  });

  it("fails on an unknown case or group and on invalid input, writing nothing", async () => {
    expect(await updateCase(db, "nope", { title: "T" }, writer)).toEqual({ ok: false, error: "caseNotFound" });
    expect(await updateCase(db, "PROJ-11", { title: "T", groupKey: "nope" }, writer)).toEqual({
      ok: false,
      error: "groupNotFound",
    });
    expect(await updateCase(db, "PROJ-11", { title: "x".repeat(501) }, writer)).toEqual({
      ok: false,
      error: "invalidInput",
    });
    expect(await row("PROJ-11")).toMatchObject({ title: "PROJ-11", contentVersion: 1 });
  });
});

describe("setCaseArchived and moveCase", () => {
  it("archives and restores a case", async () => {
    expect(await setCaseArchived(db, "PROJ-11", true)).toEqual({ ok: true });
    expect((await listCases(db, { archived: true })).map((c) => c.key)).toEqual(["PROJ-11"]);
    expect((await exportGroup(db, "PROJ-1"))?.cases.map((c) => c.key)).toEqual(["PROJ-12"]);
    await setCaseArchived(db, "PROJ-11", false);
    expect(await listCases(db, { archived: true })).toEqual([]);
    expect(await setCaseArchived(db, "nope", true)).toEqual({ ok: false, error: "caseNotFound" });
  });

  it("moves a case up and down, skipping archived neighbours", async () => {
    await createCase(db, "PROJ-1", { key: "C-3", title: "C3", description: "", acceptanceCriteria: [] });
    await setCaseArchived(db, "PROJ-12", true);
    expect(await moveCase(db, "C-3", "up")).toEqual({ ok: true });
    expect((await listCases(db, { groupKey: "PROJ-1", archived: false })).map((c) => c.key)).toEqual([
      "C-3",
      "PROJ-11",
    ]);
    await moveCase(db, "C-3", "down");
    expect((await listCases(db, { groupKey: "PROJ-1", archived: false })).map((c) => c.key)).toEqual([
      "PROJ-11",
      "C-3",
    ]);
  });

  it("restores a case at the end of its group", async () => {
    await createCase(db, "PROJ-1", { key: "C-3", title: "C3", description: "", acceptanceCriteria: [] });
    await setCaseArchived(db, "PROJ-11", true);
    await setCaseArchived(db, "PROJ-11", false);
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-12", "C-3", "PROJ-11"]);
    expect((await row("PROJ-11")).position).toBe(3);
  });

  it("moves a case up and down when positions tie", async () => {
    await createCase(db, "PROJ-1", { key: "C-3", title: "C3", description: "", acceptanceCriteria: [] });
    for (const key of ["PROJ-11", "PROJ-12", "C-3"]) await setRow(key, { position: 0 });
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-11", "PROJ-12", "C-3"]);
    await moveCase(db, "PROJ-12", "up");
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-12", "PROJ-11", "C-3"]);
    await moveCase(db, "PROJ-11", "down");
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-12", "C-3", "PROJ-11"]);
    expect((await listCases(db, { groupKey: "PROJ-1" })).map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it("renumbers an archived case that ties with an active one, keeping positions distinct", async () => {
    await createCase(db, "PROJ-1", { key: "C-3", title: "C3", description: "", acceptanceCriteria: [] });
    await setCaseArchived(db, "PROJ-12", true);
    await setRow("C-3", { position: 1 });
    await moveCase(db, "C-3", "up");
    expect((await listCases(db, { groupKey: "PROJ-1" })).map((c) => [c.key, c.position])).toEqual([
      ["C-3", 0],
      ["PROJ-12", 1],
      ["PROJ-11", 2],
    ]);
  });

  it("is a no-op at the ends and reports an unknown case", async () => {
    expect(await moveCase(db, "PROJ-11", "up")).toEqual({ ok: true });
    expect(await moveCase(db, "PROJ-12", "down")).toEqual({ ok: true });
    expect(await caseKeys("PROJ-1")).toEqual(["PROJ-11", "PROJ-12"]);
    expect(await moveCase(db, "nope", "up")).toEqual({ ok: false, error: "caseNotFound" });
  });
});

describe("read", () => {
  it("lists cases with their fields and exports a group in sync file format", async () => {
    await createCase(db, "PROJ-1", {
      key: "C-1",
      title: "Case",
      description: "Steps",
      acceptanceCriteria: ["a", "b"],
      reference: "PROJ-1",
    });
    expect((await listCases(db, { groupKey: "PROJ-1" })).at(-1)).toEqual({
      key: "C-1",
      title: "Case",
      groupKey: "PROJ-1",
      status: "untested",
      archived: false,
      position: 2,
      reference: "PROJ-1",
    });
    const file = await exportGroup(db, "PROJ-1");
    expect(file).toMatchObject({ schemaVersion: 1, group: { key: "PROJ-1" } });
    expect(file?.cases.at(-1)).toEqual({
      key: "C-1",
      title: "Case",
      description: "Steps",
      acceptanceCriteria: ["a", "b"],
      reference: "PROJ-1",
    });
    expect(await exportGroup(db, "nope")).toBeNull();
  });
});
