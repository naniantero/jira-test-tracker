import { getDb, type AppDb } from "@/lib/db";
import {
  getProjectTree,
  getStoryByKey,
  type ProjectTree,
  type StoryDetail,
  type TreeFilter,
} from "@/lib/stories/queries";

/* Page data. No Next.js imports, so tests call these directly. */

type Deps = { db?: AppDb };

export async function loadTree(filter: TreeFilter, deps?: Deps): Promise<{ tree: ProjectTree }> {
  const db = deps?.db ?? (await getDb());
  return { tree: await getProjectTree(db, filter) };
}

/** The story for the sheet, or null for an unknown key. An archived story comes back with `archived` set. */
export async function loadStory(key: string, deps?: Deps): Promise<{ story: StoryDetail | null }> {
  const db = deps?.db ?? (await getDb());
  return { story: await getStoryByKey(db, key) };
}
