import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@/lib/stories/status";
import { getAuth } from "./auth";

export type CurrentUser = { id: string; username: string; name: string; role: Role };

/** Session lookup, deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Read the request first: it marks the route dynamic before getAuth() touches env (build prerender).
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const u = session.user;
  if (u.banned) return null;
  return {
    id: u.id,
    username: u.username ?? "",
    name: u.name,
    role: u.role === "admin" ? "admin" : "tester",
  };
});

/** Auth boundary for pages and Server Actions: redirects anonymous visitors to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return current;
}

/** Admin-only boundary: testers get a 404 so admin areas are not discoverable. */
export async function requireAdmin(): Promise<CurrentUser> {
  const current = await requireUser();
  if (current.role !== "admin") notFound();
  return current;
}
