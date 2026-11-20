import { describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { lockEpicRow, lockSync, writeTx, type AppDb } from "@/lib/db";
import { createTestDb } from "../helpers/test-db";

const now = new Date();

async function seedEpic(db: AppDb, key = "E-1") {
  const [epic] = await db.orm
    .insert(db.t.epics)
    .values({ key, title: key, position: 0, createdAt: now, updatedAt: now })
    .returning();
  return epic;
}

const story = (epicId: number, key = "S-1") => ({
  key,
  epicId,
  title: key,
  position: 0,
  createdAt: now,
  updatedAt: now,
});

describe(`db (${process.env.TEST_DB ?? "sqlite"})`, () => {
  it("migrates and round-trips an epic and story", async () => {
    const db = await createTestDb();
    const epic = await seedEpic(db);
    await db.orm.insert(db.t.stories).values(story(epic.id));
    const [row] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, "S-1"));
    expect(row.status).toBe("untested");
  });

  it("rejects duplicate story key", async () => {
    const db = await createTestDb();
    const epic = await seedEpic(db);
    await db.orm.insert(db.t.stories).values(story(epic.id));
    await expect(db.orm.insert(db.t.stories).values(story(epic.id))).rejects.toThrow();
  });

  it("round-trips millisecond dates", async () => {
    const db = await createTestDb();
    const at = new Date(1_763_400_000_123);
    const [epic] = await db.orm
      .insert(db.t.epics)
      .values({ key: "E-1", title: "E-1", position: 0, archivedAt: at, createdAt: at, updatedAt: at })
      .returning();
    await db.orm
      .insert(db.t.stories)
      .values([{ ...story(epic.id, "S-1"), statusChangedAt: at }, story(epic.id, "S-2")]);
    await db.orm.insert(db.t.user).values({
      id: "u1",
      name: "Tester",
      email: "tester@example.com",
      createdAt: at,
      updatedAt: at,
    });

    const [e] = await db.orm.select().from(db.t.epics);
    expect([e.createdAt, e.updatedAt, e.archivedAt]).toEqual([at, at, at]);
    const rows = await db.orm.select().from(db.t.stories).orderBy(db.t.stories.key);
    expect(rows[0].statusChangedAt).toEqual(at);
    const [u] = await db.orm.select().from(db.t.user);
    expect([u.createdAt, u.updatedAt]).toEqual([at, at]);
  });

  it("enforces foreign keys inside and outside writeTx", async () => {
    const db = await createTestDb();
    await expect(db.orm.insert(db.t.stories).values(story(999))).rejects.toThrow();
    await expect(writeTx(db, (tx) => tx.insert(db.t.stories).values(story(999)))).rejects.toThrow();
    const [{ n }] = await db.orm.select({ n: count() }).from(db.t.stories);
    expect(n).toBe(0);
  });

  it("writeTx rolls back on error", async () => {
    const db = await createTestDb();
    await seedEpic(db, "E-1");
    await expect(
      writeTx(db, async (tx) => {
        await tx.insert(db.t.epics).values({ key: "E-2", title: "E-2", position: 1, createdAt: now, updatedAt: now });
        await tx.insert(db.t.epics).values({ key: "E-1", title: "E-1", position: 2, createdAt: now, updatedAt: now });
      }),
    ).rejects.toThrow();
    const [{ n }] = await db.orm.select({ n: count() }).from(db.t.epics);
    expect(n).toBe(1);
  });

  it("serializes 20 concurrent writeTx increments without SQLITE_BUSY", async () => {
    const db = await createTestDb();
    const epic = await seedEpic(db);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        writeTx(db, async (tx) => {
          await lockEpicRow(db, tx, epic.id);
          const [row] = await tx
            .select({ position: db.t.epics.position })
            .from(db.t.epics)
            .where(eq(db.t.epics.id, epic.id));
          await tx
            .update(db.t.epics)
            .set({ position: row.position + 1 })
            .where(eq(db.t.epics.id, epic.id));
        }),
      ),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const [row] = await db.orm.select().from(db.t.epics).where(eq(db.t.epics.id, epic.id));
    expect(row.position).toBe(20);
  });

  it("lock helpers run on every backend", async () => {
    const db = await createTestDb();
    const epic = await seedEpic(db);
    await writeTx(db, async (tx) => {
      await lockSync(db, tx, "shared");
      await lockEpicRow(db, tx, epic.id);
    });
    await writeTx(db, async (tx) => {
      await lockSync(db, tx, "exclusive");
      await lockEpicRow(db, tx, epic.id);
    });
  });
});
