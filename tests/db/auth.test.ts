import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/test-db";
import { createAuth, type Auth } from "@/lib/auth/auth";
import { createAppUser, seedAdmin, syntheticEmail } from "@/lib/auth/users";
import type { AppDb } from "@/lib/db";

// Session helpers depend on Next request APIs and the app singleton; swap both for test doubles.
const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  auth: undefined as unknown,
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
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

async function setup(): Promise<{ db: AppDb; auth: Auth }> {
  const db = await createTestDb();
  const auth = createAuth(db, { secret: "x".repeat(32), baseURL: "http://localhost:3000" });
  return { db, auth };
}

async function signInHeaders(auth: Auth, username: string, password: string): Promise<Headers> {
  const res = await auth.api.signInUsername({ body: { username, password }, asResponse: true });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie") ?? "";
  const token = cookie.split(";")[0];
  return new Headers({ cookie: token });
}

describe("syntheticEmail", () => {
  it("maps a username to a non-routable address", () => {
    expect(syntheticEmail("alice")).toBe("alice@users.invalid");
  });
});

describe("seedAdmin", () => {
  it("seedAdmin creates admin when no users", async () => {
    const { db, auth } = await setup();
    expect(await seedAdmin(auth, db, ADMIN)).toBe("created");
    const rows = await db.orm.select().from(db.t.user);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].username).toBe("admin");
  });

  it("seedAdmin is skipped when users exist", async () => {
    const { db, auth } = await setup();
    expect(await seedAdmin(auth, db, ADMIN)).toBe("created");
    expect(await seedAdmin(auth, db, { username: "other", password: "another-pass-1" })).toBe("skipped");
    expect(await db.orm.select().from(db.t.user)).toHaveLength(1);
  });

  it("seedAdmin is skipped without creds", async () => {
    const { db, auth } = await setup();
    expect(await seedAdmin(auth, db)).toBe("skipped");
    expect(await db.orm.select().from(db.t.user)).toHaveLength(0);
  });
});

describe("sign-in", () => {
  it("seeded admin can sign in with username", async () => {
    const { db, auth } = await setup();
    await seedAdmin(auth, db, ADMIN);
    const res = await auth.api.signInUsername({ body: ADMIN });
    expect(res?.token).toEqual(expect.any(String));
    expect(res?.user.username).toBe("admin");
  });

  it("wrong password is rejected", async () => {
    const { db, auth } = await setup();
    await seedAdmin(auth, db, ADMIN);
    await expect(
      auth.api.signInUsername({ body: { username: "admin", password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("self sign-up is disabled", async () => {
    const { auth } = await setup();
    await expect(
      auth.api.signUpEmail({
        body: { email: "eve@example.com", password: "long-enough-pw", name: "Eve" },
      }),
    ).rejects.toThrow();
  });

  it("login is rate limited to 5 attempts per minute per IP", async () => {
    const { db, auth } = await setup();
    await seedAdmin(auth, db, ADMIN);
    const attempt = (ip: string) =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/sign-in/username", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ username: "admin", password: "wrong-password" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt("203.0.113.7")).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
    // A different client IP has its own bucket.
    expect((await attempt("203.0.113.8")).status).not.toBe(429);
  });
});

describe("createAppUser", () => {
  it("creates a tester who can sign in", async () => {
    const { db, auth } = await setup();
    const { id } = await createAppUser(auth, {
      username: "Tester1",
      name: "Tina Tester",
      password: "tester-pass-1",
      role: "tester",
    });
    const row = (await db.orm.select().from(db.t.user).where(eq(db.t.user.id, id)))[0];
    expect(row?.username).toBe("tester1");
    expect(row?.role).toBe("tester");
    expect(row?.email).toBe("tester1@users.invalid");
    const res = await auth.api.signInUsername({
      body: { username: "tester1", password: "tester-pass-1" },
    });
    expect(res?.token).toEqual(expect.any(String));
  });

  it("createAppUser rejects 9-char password", async () => {
    const { db, auth } = await setup();
    await expect(
      createAppUser(auth, { username: "bob", name: "Bob", password: "123456789", role: "tester" }),
    ).rejects.toThrow();
    expect(await db.orm.select().from(db.t.user)).toHaveLength(0);
  });

  it("rejects a too-short username", async () => {
    const { db, auth } = await setup();
    await expect(
      createAppUser(auth, { username: "ab", name: "Ab", password: "long-enough-pw", role: "tester" }),
    ).rejects.toThrow();
    expect(await db.orm.select().from(db.t.user)).toHaveLength(0);
  });

  it("a signed-in tester cannot use admin endpoints", async () => {
    const { auth } = await setup();
    await createAppUser(auth, { username: "tina", name: "Tina", password: "tester-pass-1", role: "tester" });
    const headers = await signInHeaders(auth, "tina", "tester-pass-1");
    await expect(
      auth.api.createUser({
        headers,
        body: { email: "x@users.invalid", password: "long-enough-pw", name: "X", role: "admin" },
      }),
    ).rejects.toThrow();
    await expect(auth.api.listUsers({ headers, query: {} })).rejects.toThrow();
  });

  it("rejects a duplicate username", async () => {
    const { auth } = await setup();
    const input = { username: "dup", name: "Dup", password: "long-enough-pw", role: "tester" } as const;
    await createAppUser(auth, input);
    await expect(createAppUser(auth, input)).rejects.toThrow();
  });
});

describe("session helpers", () => {
  beforeEach(() => {
    mocks.headers = new Headers();
  });

  it("getCurrentUser returns null without a session", async () => {
    const { auth } = await setup();
    mocks.auth = auth;
    const { getCurrentUser } = await import("@/lib/auth/session");
    expect(await getCurrentUser()).toBeNull();
  });

  it("requireUser redirects to /login without a session", async () => {
    const { auth } = await setup();
    mocks.auth = auth;
    const { requireUser } = await import("@/lib/auth/session");
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("requireUser returns the signed-in tester; requireAdmin 404s for testers", async () => {
    const { auth } = await setup();
    mocks.auth = auth;
    const { id } = await createAppUser(auth, {
      username: "tina",
      name: "Tina",
      password: "tester-pass-1",
      role: "tester",
    });
    mocks.headers = await signInHeaders(auth, "tina", "tester-pass-1");
    const { requireUser, requireAdmin } = await import("@/lib/auth/session");
    expect(await requireUser()).toEqual({ id, username: "tina", name: "Tina", role: "tester" });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("requireAdmin returns the signed-in admin", async () => {
    const { db, auth } = await setup();
    mocks.auth = auth;
    await seedAdmin(auth, db, ADMIN);
    mocks.headers = await signInHeaders(auth, ADMIN.username, ADMIN.password);
    const { requireAdmin } = await import("@/lib/auth/session");
    expect(await requireAdmin()).toMatchObject({ username: "admin", role: "admin" });
  });
});

describe("username enumeration", () => {
  it("does not expose /is-username-available", async () => {
    const { auth } = await setup();
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/is-username-available", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("self-service profile changes", () => {
  // Event attribution comes from the user's name; testers must not be able to rename themselves.
  const post = (auth: Auth, path: string, headers: Headers, body: unknown) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: { ...Object.fromEntries(headers), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("does not expose /update-user or /change-email to a signed-in tester", async () => {
    const { db, auth } = await setup();
    const { id } = await createAppUser(auth, {
      username: "tina",
      name: "Tina",
      password: "tester-pass-1",
      role: "tester",
    });
    const headers = await signInHeaders(auth, "tina", "tester-pass-1");
    expect((await post(auth, "/update-user", headers, { name: "Renamed", username: "admin2" })).status).toBe(404);
    expect((await post(auth, "/change-email", headers, { newEmail: "x@users.invalid" })).status).toBe(404);
    const row = (await db.orm.select().from(db.t.user).where(eq(db.t.user.id, id)))[0];
    expect(row).toMatchObject({ name: "Tina", username: "tina", email: "tina@users.invalid" });
  });

  it("a tester can still change their own password", async () => {
    const { auth } = await setup();
    await createAppUser(auth, { username: "tina", name: "Tina", password: "tester-pass-1", role: "tester" });
    const headers = await signInHeaders(auth, "tina", "tester-pass-1");
    const res = await post(auth, "/change-password", headers, {
      currentPassword: "tester-pass-1",
      newPassword: "tester-pass-2",
    });
    expect(res.status).toBe(200);
    expect((await auth.api.signInUsername({ body: { username: "tina", password: "tester-pass-2" } }))?.token).toEqual(
      expect.any(String),
    );
  });
});
