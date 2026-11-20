import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_STRUCTURE, seedStructure } from "../helpers/seed";
import { createTestDb } from "../helpers/test-db";
import { writeTx, type AppDb } from "@/lib/db";
import { computeProgress, isComplete } from "@/lib/stories/progress";
import { getProjectTree, getStoryByKey } from "@/lib/stories/queries";
import { dismissContentChange, recordStoryEvent, updateStatusIfCurrent } from "@/lib/stories/events";
import type { Role } from "@/lib/stories/status";

const tester = { id: "u-tester", name: "Tina Tester", role: "tester" as Role };
const tester2 = { id: "u-tester-2", name: "Tom Tester", role: "tester" as Role };
const admin = { id: "u-admin", name: "Adam Admin", role: "admin" as Role };

const STALE = "staleStatus";

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedStructure(db, BASE_STRUCTURE);
  for (const u of [tester, tester2, admin]) {
    await db.orm.insert(db.t.user).values({ id: u.id, name: u.name, email: `${u.id}@users.invalid` });
  }
});

async function row(key: string) {
  const [r] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, key)).limit(1);
  return r;
}
const pass = (key: string, actor = tester, from: "untested" | "retest" = "untested") =>
  recordStoryEvent(db, {
    storyKey: key,
    actor,
    expectedStatus: from,
    expectedContentVersion: 1,
    toStatus: "passed",
    comment: null,
    files: [],
  });
const setRow = (key: string, v: Partial<AppDb["t"]["stories"]["$inferInsert"]>) =>
  db.orm.update(db.t.stories).set(v).where(eq(db.t.stories.key, key));
const archiveEpic = (key: string) =>
  db.orm.update(db.t.epics).set({ archivedAt: new Date() }).where(eq(db.t.epics.key, key));
const eventCount = async () => (await db.orm.select({ n: count() }).from(db.t.storyEvents))[0].n;

describe("computeProgress", () => {
  it("computeProgress counts each status", () => {
    const c = computeProgress(["untested", "passed", "passed", "failed", "retest"]);
    expect(c).toEqual({ total: 5, untested: 1, passed: 2, failed: 1, retest: 1, tested: 4 });
    expect(isComplete(c)).toBe(false);
    expect(isComplete(computeProgress(["passed"]))).toBe(true);
    expect(isComplete(computeProgress([]))).toBe(false);
  });
});

describe("getProjectTree", () => {
  it("tree filters issues and hides epics without matches", async () => {
    await setRow("PROJ-12", { status: "failed" });
    const tree = await getProjectTree(db, "issues");
    expect(tree.epics.map((e) => e.key)).toEqual(["PROJ-1"]);
    expect(tree.epics[0].stories.map((s) => s.key)).toEqual(["PROJ-12"]);
    expect(tree.epics[0].progress.total).toBe(2);
    expect(tree.overall.total).toBe(3);
    expect((await getProjectTree(db, "all")).epics).toHaveLength(2);
  });

  it("tabCounts reflect all non-archived stories", async () => {
    await setRow("PROJ-11", { status: "failed" });
    await setRow("PROJ-12", { status: "retest" });
    const t = (await getProjectTree(db, "issues")).tabCounts;
    expect(t).toEqual({ all: 3, untested: 1, issues: 1, retest: 1, changed: 0 });
  });

  it("archived stories are excluded", async () => {
    await setRow("PROJ-21", { archivedAt: new Date() });
    const tree = await getProjectTree(db, "all");
    expect(tree.epics.flatMap((e) => e.stories.map((s) => s.key))).toEqual(["PROJ-11", "PROJ-12"]);
    expect(tree.overall.total).toBe(2);
    expect(tree.tabCounts.all).toBe(2);
  });

  it("changed filter and tabCounts.changed", async () => {
    await setRow("PROJ-11", { contentChangedAt: new Date() });
    const tree = await getProjectTree(db, "changed");
    expect(tree.tabCounts.changed).toBe(1);
    expect(tree.epics.flatMap((e) => e.stories.map((s) => s.key))).toEqual(["PROJ-11"]);
  });
});

describe("recordStoryEvent", () => {
  it("records a pass and updates list fields", async () => {
    const r = await pass("PROJ-11");
    expect(r.ok).toBe(true);
    const s = await row("PROJ-11");
    expect(s.status).toBe("passed");
    expect(s.statusChangedByName).toBe("Tina Tester");
    expect(s.statusChangedAt).toBeInstanceOf(Date);
    const d = (await getStoryByKey(db, "PROJ-11"))!;
    expect(d.timeline[0]).toMatchObject({ fromStatus: "untested", toStatus: "passed", actorName: "Tina Tester" });
  });

  it("requires a comment to report an issue", async () => {
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: "failed",
      comment: "  ",
      files: [],
    });
    expect(r).toEqual({ ok: false, error: "commentRequired" });
    expect((await row("PROJ-11")).status).toBe("untested");
  });

  it("rejects stale expectedStatus", async () => {
    await pass("PROJ-11");
    const r = await pass("PROJ-11");
    expect(r).toEqual({ ok: false, error: STALE });
  });

  it("a stale status change writes nothing", async () => {
    expect(await pass("PROJ-11", tester)).toMatchObject({ ok: true });
    const before = await eventCount();
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester2,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: "failed",
      comment: "broken for me",
      files: [],
    });
    expect(r).toEqual({ ok: false, error: STALE });
    expect(await eventCount()).toBe(before);
    expect((await row("PROJ-11")).status).toBe("passed");
  });

  it("refuses a status change against an outdated test case and writes nothing", async () => {
    await setRow("PROJ-11", { contentVersion: 2 });
    const before = await eventCount();
    const r = await pass("PROJ-11");
    expect(r).toEqual({ ok: false, error: "contentChanged" });
    expect(await eventCount()).toBe(before);
    expect((await row("PROJ-11")).status).toBe("untested");
  });

  it("reports contentChanged when both the version and the status differ", async () => {
    await setRow("PROJ-11", { status: "passed", contentVersion: 2 });
    expect(await pass("PROJ-11")).toEqual({ ok: false, error: "contentChanged" });
  });

  it("accepts a status change that matches the current version", async () => {
    await setRow("PROJ-11", { contentVersion: 3 });
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 3,
      toStatus: "passed",
      comment: null,
      files: [],
    });
    expect(r.ok).toBe(true);
    expect((await row("PROJ-11")).status).toBe("passed");
  });

  it("comment-only event ignores an outdated version", async () => {
    await setRow("PROJ-11", { contentVersion: 2 });
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "still a note",
      files: [],
    });
    expect(r.ok).toBe(true);
  });

  it("updateStatusIfCurrent refuses when the content version moved", async () => {
    await setRow("PROJ-11", { contentVersion: 2 });
    const s = await row("PROJ-11");
    const changed = await writeTx(db, (tx) =>
      updateStatusIfCurrent(db, tx, s.id, "untested", 1, {
        status: "passed",
        statusChangedAt: new Date(),
        statusChangedByName: "Tom Tester",
      }),
    );
    expect(changed).toBe(false);
    expect((await row("PROJ-11")).status).toBe("untested");
  });

  it("updateStatusIfCurrent refuses when the status already moved", async () => {
    await setRow("PROJ-11", { status: "passed" });
    const s = await row("PROJ-11");
    const changed = await writeTx(db, (tx) =>
      updateStatusIfCurrent(db, tx, s.id, "untested", 1, {
        status: "failed",
        statusChangedAt: new Date(),
        statusChangedByName: "Tom Tester",
      }),
    );
    expect(changed).toBe(false);
    expect((await row("PROJ-11")).status).toBe("passed");
  });

  it("updateStatusIfCurrent applies the patch when the status matches", async () => {
    await setRow("PROJ-11", { contentChangedAt: new Date() });
    const s = await row("PROJ-11");
    const at = new Date();
    const changed = await writeTx(db, (tx) =>
      updateStatusIfCurrent(db, tx, s.id, "untested", 1, {
        status: "passed",
        statusChangedAt: at,
        statusChangedByName: "Tom Tester",
      }),
    );
    expect(changed).toBe(true);
    expect(await row("PROJ-11")).toMatchObject({
      status: "passed",
      statusChangedAt: at,
      statusChangedByName: "Tom Tester",
      contentChangedAt: null,
    });
  });

  it("updateStatusIfCurrent refuses an archived story", async () => {
    await setRow("PROJ-11", { archivedAt: new Date() });
    const s = await row("PROJ-11");
    const changed = await writeTx(db, (tx) =>
      updateStatusIfCurrent(db, tx, s.id, "untested", 1, {
        status: "passed",
        statusChangedAt: new Date(),
        statusChangedByName: "Tom Tester",
      }),
    );
    expect(changed).toBe(false);
    expect((await row("PROJ-11")).status).toBe("untested");
  });

  it("rejects events on archived story", async () => {
    await setRow("PROJ-11", { archivedAt: new Date() });
    expect(await pass("PROJ-11")).toEqual({ ok: false, error: "storyArchived" });
    expect(await pass("NOPE-1")).toEqual({ ok: false, error: "storyNotFound" });
  });

  it("rejects status changes and comments on a story of an archived epic, writing nothing", async () => {
    await archiveEpic("PROJ-1");
    expect(await pass("PROJ-11")).toEqual({ ok: false, error: "storyArchived" });
    const comment = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "note",
      files: [],
    });
    expect(comment).toEqual({ ok: false, error: "storyArchived" });
    expect((await row("PROJ-11")).status).toBe("untested");
    expect(await eventCount()).toBe(0);
    expect(await pass("PROJ-21")).toMatchObject({ ok: true });
  });

  it("comment-only event keeps status", async () => {
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "hello",
      files: [],
    });
    expect(r.ok).toBe(true);
    expect((await row("PROJ-11")).status).toBe("untested");
    expect((await row("PROJ-11")).statusChangedAt).toBeNull();
    const e = (await getStoryByKey(db, "PROJ-11"))!.timeline[0];
    expect(e).toMatchObject({ fromStatus: null, toStatus: null, comment: "hello" });
    const empty = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: " ",
      files: [],
    });
    expect(empty).toEqual({ ok: false, error: "commentOrFile" });
    const long = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "x".repeat(5001),
      files: [],
    });
    expect(long).toEqual({ ok: false, error: "commentTooLong", values: { max: 5000 } });
  });

  it("comment-only event is accepted from a stale sheet (a comment overwrites nothing)", async () => {
    await pass("PROJ-11");
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "late note",
      files: [],
    });
    expect(r.ok).toBe(true);
    expect((await row("PROJ-11")).status).toBe("passed");
    expect((await getStoryByKey(db, "PROJ-11"))!.timeline[0]).toMatchObject({
      fromStatus: null,
      toStatus: null,
      comment: "late note",
    });
  });

  const file = { storageName: "a.png", originalName: "shot.png", mimeType: "image/png", sizeBytes: 12 };

  it("comment-only event with only a file is allowed", async () => {
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: null,
      files: [file],
    });
    expect(r.ok).toBe(true);
  });

  it("stores attachments with the event and returns them in the timeline", async () => {
    await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: "failed",
      comment: "broken",
      files: [file],
    });
    expect(await db.orm.select().from(db.t.attachments)).toHaveLength(1);
    const t = (await getStoryByKey(db, "PROJ-11"))!.timeline;
    expect(t[0].attachments).toEqual([
      { id: expect.stringMatching(/^[0-9a-f-]{36}$/), originalName: "shot.png", mimeType: "image/png", sizeBytes: 12 },
    ]);
  });

  it("attachments keep upload order", async () => {
    const files = [
      { storageName: "s-b.png", originalName: "b.png", mimeType: "image/png", sizeBytes: 1 },
      { storageName: "s-a.png", originalName: "a.png", mimeType: "image/png", sizeBytes: 1 },
    ];
    const r = await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: null,
      comment: null,
      files,
    });
    expect(r.ok).toBe(true);
    const t = (await getStoryByKey(db, "PROJ-11"))!.timeline;
    expect(t[0].attachments.map((a) => a.originalName)).toEqual(["b.png", "a.png"]);
  });

  it("signals epicCompleted, with the epic's title, only on the completing pass", async () => {
    await db.orm.update(db.t.epics).set({ title: "Checkout" }).where(eq(db.t.epics.key, "PROJ-1"));
    const first = await pass("PROJ-11");
    expect(first).toMatchObject({ ok: true, epicCompleted: null });
    const second = await pass("PROJ-12");
    expect(second).toMatchObject({ ok: true, epicCompleted: { key: "PROJ-1", title: "Checkout" } });
    const fail = await recordStoryEvent(db, {
      storyKey: "PROJ-12",
      actor: admin,
      expectedStatus: "passed",
      expectedContentVersion: 1,
      toStatus: "failed",
      comment: "regressed",
      files: [],
    });
    expect(fail).toMatchObject({ ok: true, epicCompleted: null });
    const again = await recordStoryEvent(db, {
      storyKey: "PROJ-12",
      actor: admin,
      expectedStatus: "failed",
      expectedContentVersion: 1,
      toStatus: "passed",
      comment: "fixed",
      files: [],
    });
    expect(again).toMatchObject({ ok: true, epicCompleted: { key: "PROJ-1" } });
    const comment = await recordStoryEvent(db, {
      storyKey: "PROJ-12",
      actor: admin,
      expectedStatus: "passed",
      expectedContentVersion: 1,
      toStatus: null,
      comment: "note",
      files: [],
    });
    expect(comment).toMatchObject({ ok: true, epicCompleted: null });
  });

  it("status change clears contentChangedAt", async () => {
    await setRow("PROJ-11", { contentChangedAt: new Date() });
    await pass("PROJ-11");
    expect((await row("PROJ-11")).contentChangedAt).toBeNull();
  });

  it("keeps actorName after user deleted", async () => {
    await db.orm.insert(db.t.user).values({ id: "u1", name: "Gone", email: "g@users.invalid" });
    await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: { id: "u1", name: "Gone", role: "tester" },
      expectedStatus: "untested",
      expectedContentVersion: 1,
      toStatus: "passed",
      comment: null,
      files: [],
    });
    await db.orm.delete(db.t.user).where(eq(db.t.user.id, "u1"));
    const [ev] = await db.orm.select().from(db.t.storyEvents).orderBy(db.t.storyEvents.id);
    expect(ev.userId).toBeNull();
    expect(ev.actorName).toBe("Gone");
  });
});

describe("dismissContentChange", () => {
  it("dismissContentChange keeps status, clears marker and logs event", async () => {
    await setRow("PROJ-11", { status: "passed", contentChangedAt: new Date() });
    const r = await dismissContentChange(db, { storyKey: "PROJ-11", actor: admin });
    expect(r).toEqual({ ok: true });
    expect((await row("PROJ-11")).status).toBe("passed");
    expect((await row("PROJ-11")).contentChangedAt).toBeNull();
    expect((await getStoryByKey(db, "PROJ-11"))!.timeline[0]).toMatchObject({
      comment: "Content change reviewed; status kept.",
      fromStatus: null,
      toStatus: null,
    });
    expect(await dismissContentChange(db, { storyKey: "PROJ-11", actor: admin })).toEqual({
      ok: false,
      error: "nothingToReview",
    });
  });

  it("dismissing after a status change cleared the marker writes nothing", async () => {
    await setRow("PROJ-11", { status: "passed", contentChangedAt: new Date() });
    await recordStoryEvent(db, {
      storyKey: "PROJ-11",
      actor: tester,
      expectedStatus: "passed",
      expectedContentVersion: 1,
      toStatus: "failed",
      comment: "broken",
      files: [],
    });
    const before = await eventCount();
    expect(await dismissContentChange(db, { storyKey: "PROJ-11", actor: admin })).toEqual({
      ok: false,
      error: "nothingToReview",
    });
    expect(await eventCount()).toBe(before);
    expect((await row("PROJ-11")).contentChangedAt).toBeNull();
  });

  it("refuses to dismiss on an archived story or a story of an archived epic", async () => {
    await setRow("PROJ-11", { status: "passed", contentChangedAt: new Date(), archivedAt: new Date() });
    await setRow("PROJ-21", { status: "passed", contentChangedAt: new Date() });
    await archiveEpic("PROJ-2");
    for (const storyKey of ["PROJ-11", "PROJ-21"]) {
      expect(await dismissContentChange(db, { storyKey, actor: admin })).toEqual({ ok: false, error: "storyArchived" });
      expect((await row(storyKey)).contentChangedAt).not.toBeNull();
    }
    expect(await eventCount()).toBe(0);
  });

  it("tester cannot dismiss", async () => {
    await setRow("PROJ-11", { contentChangedAt: new Date() });
    expect(await dismissContentChange(db, { storyKey: "PROJ-11", actor: tester })).toEqual({
      ok: false,
      error: "notAllowed",
    });
    expect((await row("PROJ-11")).contentChangedAt).not.toBeNull();
  });
});
