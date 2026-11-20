// Concurrent writes through the domain functions, each pair started together with Promise.all.
// - db:postgres: two pooled connections really race; this is the proof that the locks and conditional
//   updates hold under READ COMMITTED.
// - db:sqlite: the libsql layer runs one client call at a time and a transaction holds its turn, so these
//   tests exercise that serialization gate rather than racing connections.
// - db:pglite: a single in-process connection, so the writes run one after the other and pass trivially.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_STRUCTURE, seedStructure } from "../helpers/seed";
import { createTestDb } from "../helpers/test-db";
import type { AppDb } from "@/lib/db";
import { dismissContentChange, recordStoryEvent } from "@/lib/stories/events";
import type { Role } from "@/lib/stories/status";

const tester = { id: "u-tester", name: "Tina Tester", role: "tester" as Role };
const tester2 = { id: "u-tester-2", name: "Tom Tester", role: "tester" as Role };
const admin = { id: "u-admin", name: "Adam Admin", role: "admin" as Role };

const STALE = "staleStatus";
const REVIEWED = "Content change reviewed; status kept.";

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedStructure(db, BASE_STRUCTURE);
  for (const u of [tester, tester2, admin]) {
    await db.orm.insert(db.t.user).values({ id: u.id, name: u.name, email: `${u.id}@users.invalid` });
  }
});

async function story(key: string) {
  const [r] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, key)).limit(1);
  return r;
}
const setStory = (key: string, v: Partial<AppDb["t"]["stories"]["$inferInsert"]>) =>
  db.orm.update(db.t.stories).set(v).where(eq(db.t.stories.key, key));
const eventsOf = async (key: string) => {
  const { id } = await story(key);
  return db.orm.select().from(db.t.storyEvents).where(eq(db.t.storyEvents.storyId, id)).orderBy(db.t.storyEvents.id);
};
const pass = (key: string, actor = tester) =>
  recordStoryEvent(db, {
    storyKey: key,
    actor,
    expectedStatus: "untested",
    expectedContentVersion: 1,
    toStatus: "passed",
    comment: null,
    files: [],
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("concurrent writes", () => {
  it("two status changes from the same status: exactly one wins", async () => {
    const results = await Promise.all([pass("PROJ-11", tester), pass("PROJ-11", tester2)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: STALE }]);
    const statusEvents = (await eventsOf("PROJ-11")).filter((e) => e.toStatus !== null);
    expect(statusEvents).toHaveLength(1);
    expect((await story("PROJ-11")).status).toBe("passed");
  });

  it("finishing an epic's last two stories at once celebrates exactly once", async () => {
    // PROJ-1 has exactly two stories, both untested.
    const results = await Promise.all([pass("PROJ-11", tester), pass("PROJ-12", tester2)]);
    expect(results.every((r) => r.ok)).toBe(true);
    const celebrations = results.filter((r) => r.ok && r.epicCompleted !== null);
    expect(celebrations).toHaveLength(1);
    expect(celebrations[0]).toMatchObject({ epicCompleted: { key: "PROJ-1" } });
  });

  it("a status change racing a content-change dismissal logs the dismissal only if it cleared the marker", async () => {
    // Started together, the shorter dismissal nearly always finishes first. Delaying it by 0-7 ms over the
    // rounds lets the status change commit inside the dismissal's read-to-write window too.
    for (let round = 0; round < 40; round++) {
      await setStory("PROJ-11", { status: "passed", contentChangedAt: new Date() });
      const before = (await eventsOf("PROJ-11")).length;
      const [change, dismiss] = await Promise.all([
        recordStoryEvent(db, {
          storyKey: "PROJ-11",
          actor: tester,
          expectedStatus: "passed",
          expectedContentVersion: 1,
          toStatus: "failed",
          comment: `round ${round}`,
          files: [],
        }),
        delay(round % 8).then(() => dismissContentChange(db, { storyKey: "PROJ-11", actor: admin })),
      ]);
      expect(change.ok).toBe(true);
      const newEvents = (await eventsOf("PROJ-11")).slice(before);
      const changeEvent = newEvents.find((e) => e.toStatus === "failed");
      const dismissEvents = newEvents.filter((e) => e.comment === REVIEWED);
      expect(changeEvent).toBeDefined();
      if (dismiss.ok) {
        // "Status kept" is only true if the dismissal cleared the marker before the status change ran.
        expect(dismissEvents).toHaveLength(1);
        expect(dismissEvents[0].id).toBeLessThan(changeEvent!.id);
      } else {
        expect(dismiss).toEqual({ ok: false, error: "nothingToReview" });
        expect(dismissEvents).toHaveLength(0);
      }
      expect(newEvents).toHaveLength(dismiss.ok ? 2 : 1);
      expect((await story("PROJ-11")).contentChangedAt).toBeNull();
    }
  });
});
