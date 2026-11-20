import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { seedStructure } from "../helpers/seed";
import { createTestDb } from "../helpers/test-db";
import type { AppDb } from "@/lib/db";
import { loadStory, loadTree } from "@/lib/content/load";
import { getProjectTree } from "@/lib/stories/queries";

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
  await seedStructure(db, {
    epics: [
      {
        key: "PROJ-1",
        title: "Checkout",
        stories: [
          { key: "PROJ-11", title: "Cart", description: "Edit the cart", criteria: ["Add works", "Remove works"] },
          { key: "PROJ-12", title: "Payment" },
        ],
      },
      { key: "PROJ-2", title: "Account", stories: [{ key: "PROJ-21", title: "Login" }] },
    ],
  });
});

const archive = (key: string) =>
  db.orm.update(db.t.stories).set({ archivedAt: new Date() }).where(eq(db.t.stories.key, key));

describe("loadStory", () => {
  it("loadStory returns the seeded title, description, criteria and epic title", async () => {
    const { story } = await loadStory("PROJ-11", { db });
    expect(story).toMatchObject({
      key: "PROJ-11",
      title: "Cart",
      description: "Edit the cart",
      acceptanceCriteria: ["Add works", "Remove works"],
      reference: null,
      contentVersion: 1,
      epicKey: "PROJ-1",
      epicTitle: "Checkout",
      archived: false,
    });
  });

  it("loadStory defaults to an empty description and no criteria", async () => {
    const { story } = await loadStory("PROJ-12", { db });
    expect(story).toMatchObject({ title: "Payment", description: "", acceptanceCriteria: [] });
  });

  it("loadStory returns null for an unknown key and marks an archived story", async () => {
    await archive("PROJ-12");
    expect(await loadStory("OTHER-1", { db })).toEqual({ story: null });
    expect((await loadStory("PROJ-12", { db })).story).toMatchObject({ key: "PROJ-12", archived: true });
  });

  it("loadStory marks a story of an archived epic as archived", async () => {
    await db.orm.update(db.t.epics).set({ archivedAt: new Date() }).where(eq(db.t.epics.key, "PROJ-1"));
    expect((await loadStory("PROJ-11", { db })).story).toMatchObject({ key: "PROJ-11", archived: true });
    expect((await loadStory("PROJ-21", { db })).story).toMatchObject({ archived: false });
  });
});

describe("loadTree", () => {
  it("loadTree takes epic and story titles from the database", async () => {
    const { tree } = await loadTree("all", { db });
    expect(tree.epics.map((e) => [e.key, e.title])).toEqual([
      ["PROJ-1", "Checkout"],
      ["PROJ-2", "Account"],
    ]);
    expect(tree.epics.flatMap((e) => e.stories.map((s) => [s.key, s.title, s.contentVersion]))).toEqual([
      ["PROJ-11", "Cart", 1],
      ["PROJ-12", "Payment", 1],
      ["PROJ-21", "Login", 1],
    ]);
  });

  it("getProjectTree omits an epic whose stories are all archived", async () => {
    await archive("PROJ-21");
    const tree = await getProjectTree(db, "all");
    expect(tree.epics.map((e) => e.key)).toEqual(["PROJ-1"]);
    expect(tree.overall.total).toBe(2);
  });
});
