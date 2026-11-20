import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_STRUCTURE, seedStructure } from "../helpers/seed";
import { createTestDb } from "../helpers/test-db";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { createAppUser, seedAdmin } from "@/lib/auth/users";
import { decodeCriteria, listGroups } from "@/lib/cases";
import type { AppDb } from "@/lib/db";

// The actions read the request headers, the app auth singleton and the app database; swap all three for test doubles.
const mocks = vi.hoisted(() => ({ headers: new Headers(), auth: undefined as unknown, db: undefined as unknown }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/auth")>();
  return { ...actual, getAuth: async () => mocks.auth };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, getDb: async () => mocks.db };
});

const ADMIN = { username: "admin", password: "correct-horse-1" };

async function signInHeaders(auth: Auth, username: string, password: string): Promise<Headers> {
  const res = await auth.api.signInUsername({ body: { username, password }, asResponse: true });
  expect(res.status).toBe(200);
  return new Headers({ cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] });
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

let db: AppDb;
let auth: Auth;
let adminId: string;

beforeEach(async () => {
  db = await createTestDb();
  mocks.db = db;
  auth = createAuth(db, { secret: "x".repeat(32), baseURL: "http://localhost:3000" });
  mocks.auth = auth;
  await seedAdmin(auth, db, ADMIN);
  mocks.headers = await signInHeaders(auth, ADMIN.username, ADMIN.password);
  adminId = (await auth.api.getSession({ headers: mocks.headers }))!.user.id;
  await seedStructure(db, BASE_STRUCTURE);
});

async function row(key: string) {
  const [r] = await db.orm.select().from(db.t.stories).where(eq(db.t.stories.key, key)).limit(1);
  return r;
}

describe("admin test case actions", () => {
  it("refuses a tester", async () => {
    await createAppUser(auth, { username: "tina", name: "Tina", password: "tester-pass-1", role: "tester" });
    mocks.headers = await signInHeaders(auth, "tina", "tester-pass-1");
    const { createCaseAction } = await import("@/app/(app)/admin/cases/actions");

    await expect(createCaseAction(form({ groupKey: "PROJ-1", key: "NEW-1", title: "New" }))).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(await row("NEW-1")).toBeUndefined();
  });

  it("flags a tested case it edits, with the admin as actor", async () => {
    await db.orm.update(db.t.stories).set({ status: "passed" }).where(eq(db.t.stories.key, "PROJ-11"));
    const { updateCaseAction } = await import("@/app/(app)/admin/cases/actions");

    const res = await updateCaseAction(
      form({ key: "PROJ-11", title: "Renamed", description: "", criteria: "", reference: "" }),
    );

    expect(res).toEqual({ ok: true });
    const r = await row("PROJ-11");
    expect(r.contentChangedAt).not.toBeNull();
    const events = await db.orm.select().from(db.t.storyEvents).where(eq(db.t.storyEvents.storyId, r.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: adminId, actorName: ADMIN.username, comment: "Changed: title." });
  });

  it("stores one criterion per non-blank line of the textarea", async () => {
    const { createCaseAction } = await import("@/app/(app)/admin/cases/actions");

    expect(
      await createCaseAction(
        form({
          groupKey: "PROJ-1",
          key: "NEW-1",
          title: "New",
          description: "",
          criteria: "a\n\n b \n",
          reference: "",
        }),
      ),
    ).toEqual({ ok: true });
    expect(decodeCriteria((await row("NEW-1")).criteria)).toEqual(["a", "b"]);
  });

  it("moves a case to another group from the edit form", async () => {
    const { updateCaseAction } = await import("@/app/(app)/admin/cases/actions");

    expect(
      await updateCaseAction(
        form({ key: "PROJ-11", title: "PROJ-11", description: "", criteria: "", reference: "", groupKey: "PROJ-2" }),
      ),
    ).toEqual({ ok: true });
    const [group] = await db.orm.select().from(db.t.epics).where(eq(db.t.epics.key, "PROJ-2"));
    expect((await row("PROJ-11")).epicId).toBe(group.id);
  });

  it("loads a case and a group with their full content for the edit dialogs", async () => {
    const { createCaseAction, loadCaseAction, loadGroupAction, updateGroupAction } =
      await import("@/app/(app)/admin/cases/actions");
    await createCaseAction(
      form({
        groupKey: "PROJ-2",
        key: "NEW-1",
        title: "New",
        description: "Steps",
        criteria: "a\nb",
        reference: "R-1",
      }),
    );
    await updateGroupAction(form({ key: "PROJ-2", title: "Second", description: "About" }));

    expect(await loadCaseAction("NEW-1")).toEqual({
      key: "NEW-1",
      groupKey: "PROJ-2",
      title: "New",
      description: "Steps",
      acceptanceCriteria: ["a", "b"],
      reference: "R-1",
      status: "untested",
      archived: false,
    });
    expect(await loadGroupAction("PROJ-2")).toEqual({
      key: "PROJ-2",
      title: "Second",
      description: "About",
      archived: false,
    });
    expect(await loadCaseAction("nope")).toBeNull();
  });

  it("translates library failures", async () => {
    const { createGroupAction, setCaseArchivedAction } = await import("@/app/(app)/admin/cases/actions");

    expect(await createGroupAction(form({ key: "PROJ-1", title: "Again", description: "" }))).toEqual({
      ok: false,
      error: "A group with this key already exists.",
    });
    expect(await setCaseArchivedAction("nope", true)).toEqual({ ok: false, error: "Test case not found." });
  });

  it("creates, archives and moves groups", async () => {
    const { createGroupAction, moveGroupAction, setGroupArchivedAction } =
      await import("@/app/(app)/admin/cases/actions");

    expect(await createGroupAction(form({ key: "G", title: "New group", description: "About" }))).toEqual({ ok: true });
    expect(await moveGroupAction("G", "up")).toEqual({ ok: true });
    expect(await setGroupArchivedAction("PROJ-1", true)).toEqual({ ok: true });
    expect((await listGroups(db, { archived: false })).map((g) => g.key)).toEqual(["G", "PROJ-2"]);
  });
});
