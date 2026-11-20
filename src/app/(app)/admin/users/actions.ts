"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { translateFailure } from "@/i18n/errors";
import { getAuth } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/auth/session";
import { MIN_PASSWORD_LENGTH, createAppUser } from "@/lib/auth/users";

export type ActionResult = { ok: true } | { ok: false; error: string };

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** better-auth's own message (e.g. a taken username) when it has a short one; it is not translated. */
async function failureOf(e: unknown): Promise<ActionResult> {
  const m = e instanceof Error ? e.message : "";
  if (m && m.length < 200) return { ok: false, error: m };
  return { ok: false, error: (await getTranslations("errors"))("generic") };
}

export async function createUserAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const username = str(fd, "username").trim();
  const name = str(fd, "name").trim();
  const role = str(fd, "role") === "admin" ? "admin" : "tester";
  if (!username) return translateFailure({ ok: false, error: "usernameRequired" });
  if (!name) return translateFailure({ ok: false, error: "nameRequired" });
  const password = str(fd, "password");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return translateFailure({ ok: false, error: "passwordTooShort", values: { min: MIN_PASSWORD_LENGTH } });
  }
  try {
    await createAppUser(await getAuth(), { username, name, password, role });
  } catch (e) {
    return failureOf(e);
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setPasswordAction(fd: FormData): Promise<ActionResult> {
  const current = await requireAdmin();
  const userId = str(fd, "userId");
  const password = str(fd, "password");
  if (!userId) return translateFailure({ ok: false, error: "generic" });
  // better-auth's admin setUserPassword does not enforce a minimum length.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return translateFailure({ ok: false, error: "passwordTooShort", values: { min: MIN_PASSWORD_LENGTH } });
  }
  try {
    const requestHeaders = await headers();
    const auth = await getAuth();
    await auth.api.setUserPassword({ body: { userId, newPassword: password }, headers: requestHeaders });
    // Sign the user out everywhere; for their own password an admin keeps only this session.
    if (userId === current.id) await auth.api.revokeOtherSessions({ headers: requestHeaders });
    else await auth.api.revokeUserSessions({ body: { userId }, headers: requestHeaders });
  } catch (e) {
    return failureOf(e);
  }
  return { ok: true };
}

export async function deleteUserAction(fd: FormData): Promise<ActionResult> {
  const current = await requireAdmin();
  const userId = str(fd, "userId");
  if (!userId) return translateFailure({ ok: false, error: "generic" });
  if (userId === current.id) return translateFailure({ ok: false, error: "cannotDeleteSelf" });
  try {
    await (await getAuth()).api.removeUser({ body: { userId }, headers: await headers() });
  } catch (e) {
    return failureOf(e);
  }
  revalidatePath("/admin/users");
  return { ok: true };
}
