import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { getDb, type AppDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

type AuthOptions = { secret: string; baseURL: string };

/** All better-auth options live here; only the Drizzle adapter differs per database. */
export function createAuthFor(
  adapter: { orm: unknown; provider: "sqlite" | "pg"; schema: Record<string, unknown> },
  opts: AuthOptions,
) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    // drizzleAdapter accepts any Drizzle instance (its `DB` type is an open record).
    database: drizzleAdapter(adapter.orm as Parameters<typeof drizzleAdapter>[0], {
      provider: adapter.provider,
      schema: adapter.schema,
    }),
    disabledPaths: [
      // Would let anyone probe which usernames exist.
      "/is-username-available",
      // Event attribution uses the user's name: users must not rename themselves (admins manage users
      // via server-side auth.api calls, which these do not affect). /change-password stays available.
      "/update-user",
      "/change-email",
    ],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    rateLimit: {
      // Explicit: better-auth disables rate limiting outside production by default.
      enabled: true,
      storage: "memory",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        // Users never see their synthetic email, but the endpoint is reachable; same login limit.
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      useSecureCookies: opts.baseURL.startsWith("https://"),
    },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 32, immutableUsername: true }),
      admin({ defaultRole: "tester", adminRoles: ["admin"] }),
      nextCookies(), // must stay last
    ],
  });
}

export function createAuth(db: AppDb, opts: AuthOptions) {
  return createAuthFor({ orm: db.orm, provider: db.dialect, schema: db.t }, opts);
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __appAuth?: Promise<Auth> };

/** App-wide auth instance. Lazy so `next build` works without secrets. */
export function getAuth(): Promise<Auth> {
  // Inside `.then` so that a bad environment rejects the promise instead of throwing synchronously.
  return (globalForAuth.__appAuth ??= Promise.resolve()
    .then(async () => {
      const env = getEnv();
      return createAuth(await getDb(), {
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
      });
    })
    .catch((e: unknown) => {
      globalForAuth.__appAuth = undefined;
      throw e;
    }));
}
