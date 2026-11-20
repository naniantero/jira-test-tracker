import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/test-db";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { createAppUser, seedAdmin } from "@/lib/auth/users";

// The action reads the request headers and the app auth singleton; swap both for test doubles.
const mocks = vi.hoisted(() => ({ headers: new Headers(), auth: undefined as unknown }));
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

const ADMIN = { username: "admin", password: "correct-horse-1" };

async function signInHeaders(auth: Auth, username: string, password: string): Promise<Headers> {
  const res = await auth.api.signInUsername({ body: { username, password }, asResponse: true });
  expect(res.status).toBe(200);
  return new Headers({ cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] });
}

const signedIn = async (auth: Auth, headers: Headers) => (await auth.api.getSession({ headers })) !== null;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("setPasswordAction", () => {
  let auth: Auth;
  let adminId: string;
  beforeEach(async () => {
    const db = await createTestDb();
    auth = createAuth(db, { secret: "x".repeat(32), baseURL: "http://localhost:3000" });
    mocks.auth = auth;
    await seedAdmin(auth, db, ADMIN);
    mocks.headers = await signInHeaders(auth, ADMIN.username, ADMIN.password);
    adminId = (await auth.api.getSession({ headers: mocks.headers }))!.user.id;
  });

  it("signs the user out everywhere after an admin sets their password", async () => {
    const { id } = await createAppUser(auth, {
      username: "tina",
      name: "Tina",
      password: "tester-pass-1",
      role: "tester",
    });
    const tina = await signInHeaders(auth, "tina", "tester-pass-1");
    const { setPasswordAction } = await import("@/app/(app)/admin/users/actions");

    expect(await setPasswordAction(form({ userId: id, password: "new-tester-pass-1" }))).toEqual({ ok: true });
    expect(await signedIn(auth, tina)).toBe(false);
    expect(await signedIn(auth, mocks.headers)).toBe(true);
  });

  it("keeps the acting admin's own session when they set their own password", async () => {
    const otherDevice = await signInHeaders(auth, ADMIN.username, ADMIN.password);
    const { setPasswordAction } = await import("@/app/(app)/admin/users/actions");

    expect(await setPasswordAction(form({ userId: adminId, password: "new-admin-pass-1" }))).toEqual({ ok: true });
    expect(await signedIn(auth, mocks.headers)).toBe(true);
    expect(await signedIn(auth, otherDevice)).toBe(false);
  });

  it("leaves sessions alone when the password is rejected", async () => {
    const { id } = await createAppUser(auth, {
      username: "tina",
      name: "Tina",
      password: "tester-pass-1",
      role: "tester",
    });
    const tina = await signInHeaders(auth, "tina", "tester-pass-1");
    const { setPasswordAction } = await import("@/app/(app)/admin/users/actions");

    expect((await setPasswordAction(form({ userId: id, password: "short" }))).ok).toBe(false);
    expect(await signedIn(auth, tina)).toBe(true);
  });
});
