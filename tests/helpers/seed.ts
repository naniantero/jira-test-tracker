import { encodeCriteria } from "@/lib/cases/criteria";
import type { AppDb } from "@/lib/db";
import type { StoryStatus } from "@/lib/stories/status";

export type SeedSpec = {
  epics: {
    key: string;
    title?: string;
    stories: { key: string; title?: string; description?: string; criteria?: string[]; status?: StoryStatus }[];
  }[];
};

/** Epic and story rows with positions in spec order; a missing title defaults to the key. */
export async function seedStructure(
  db: AppDb,
  spec: SeedSpec,
): Promise<{ epicIds: Map<string, number>; storyIds: Map<string, number> }> {
  const t = db.t;
  const epicIds = new Map<string, number>();
  const storyIds = new Map<string, number>();

  for (const [ei, e] of spec.epics.entries()) {
    const [{ id: epicId }] = await db.orm
      .insert(t.epics)
      .values({ key: e.key, title: e.title ?? e.key, position: ei })
      .returning({ id: t.epics.id });
    epicIds.set(e.key, epicId);
    for (const [si, s] of e.stories.entries()) {
      const [{ id }] = await db.orm
        .insert(t.stories)
        .values({
          key: s.key,
          epicId,
          title: s.title ?? s.key,
          ...(s.description !== undefined ? { description: s.description } : {}),
          ...(s.criteria ? { criteria: encodeCriteria(s.criteria) } : {}),
          position: si,
          ...(s.status ? { status: s.status } : {}),
        })
        .returning({ id: t.stories.id });
      storyIds.set(s.key, id);
    }
  }
  return { epicIds, storyIds };
}

/** The structure most DB tests start from: PROJ-1 (PROJ-11, PROJ-12) and PROJ-2 (PROJ-21). */
export const BASE_STRUCTURE: SeedSpec = {
  epics: [
    { key: "PROJ-1", stories: [{ key: "PROJ-11" }, { key: "PROJ-12" }] },
    { key: "PROJ-2", stories: [{ key: "PROJ-21" }] },
  ],
};
