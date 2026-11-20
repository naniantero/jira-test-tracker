import { count } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import type { Role } from "@/lib/stories/status";
import type { Auth } from "./auth";

export const MIN_PASSWORD_LENGTH = 10;

/** better-auth requires an email; users never see this one. `.invalid` is reserved (RFC 2606). */
export function syntheticEmail(username: string): string {
  return `${username}@users.invalid`;
}

/**
 * Server-side user creation. No headers are passed, so better-auth treats this as a trusted
 * server call (no session/permission check) — callers must authorize first (`requireAdmin()`).
 * Username length/charset and uniqueness are enforced by the username plugin's DB hook.
 */
export async function createAppUser(
  auth: Auth,
  i: { username: string; name: string; password: string; role: Role },
): Promise<{ id: string }> {
  // The admin create-user endpoint does not apply minPasswordLength itself.
  if (i.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const { user: created } = await auth.api.createUser({
    body: {
      email: syntheticEmail(i.username.toLowerCase()),
      password: i.password,
      name: i.name,
      // The plugin's types only know its built-in "admin" | "user"; "tester" is our defaultRole
      // and is accepted at runtime (no custom `roles` map is configured).
      role: i.role as "admin",
      data: { username: i.username },
    },
  });
  return { id: created.id };
}

/** Creates the first admin from env creds, only while the user table is empty. */
export async function seedAdmin(
  auth: Auth,
  db: AppDb,
  creds?: { username: string; password: string },
): Promise<"created" | "skipped"> {
  if (!creds) return "skipped";
  const [{ n }] = await db.orm.select({ n: count() }).from(db.t.user);
  if (n > 0) return "skipped";
  await createAppUser(auth, { ...creds, name: creds.username, role: "admin" });
  return "created";
}
