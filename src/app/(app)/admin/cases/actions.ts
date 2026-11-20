"use server";

import { revalidatePath } from "next/cache";
import { translateFailure } from "@/i18n/errors";
import { requireAdmin } from "@/lib/auth/session";
import {
  createCase,
  createGroup,
  getCase,
  getGroup,
  moveCase,
  moveGroup,
  setCaseArchived,
  setGroupArchived,
  updateCase,
  updateGroup,
  type CaseDetail,
  type GroupDetail,
} from "@/lib/cases";
import { getDb } from "@/lib/db";
import type { Failure } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };
type Direction = "up" | "down";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/** The criteria textarea: one criterion per line; the schema trims them and drops blank ones. */
const criteria = (fd: FormData) => str(fd, "criteria").split("\n");

async function finish(res: { ok: true } | Failure): Promise<ActionResult> {
  if (!res.ok) return translateFailure(res);
  revalidatePath("/");
  revalidatePath("/admin/cases");
  return { ok: true };
}

const invalid = (): Promise<ActionResult> => translateFailure({ ok: false, error: "invalidInput" });
const isDirection = (v: unknown): v is Direction => v === "up" || v === "down";

export async function loadGroupAction(key: string): Promise<GroupDetail | null> {
  await requireAdmin();
  if (typeof key !== "string") return null;
  return getGroup(await getDb(), key);
}

export async function loadCaseAction(key: string): Promise<CaseDetail | null> {
  await requireAdmin();
  if (typeof key !== "string") return null;
  return getCase(await getDb(), key);
}

export async function createGroupAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const description = str(fd, "description");
  return finish(
    await createGroup(await getDb(), {
      key: str(fd, "key").trim(),
      title: str(fd, "title"),
      description: description.trim() ? description : undefined,
    }),
  );
}

export async function updateGroupAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const description = str(fd, "description");
  return finish(
    await updateGroup(await getDb(), str(fd, "key").trim(), {
      title: str(fd, "title"),
      description: description.trim() ? description : null,
    }),
  );
}

export async function setGroupArchivedAction(key: string, archived: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (typeof key !== "string" || typeof archived !== "boolean") return invalid();
  return finish(await setGroupArchived(await getDb(), key, archived));
}

export async function moveGroupAction(key: string, direction: Direction): Promise<ActionResult> {
  await requireAdmin();
  if (typeof key !== "string" || !isDirection(direction)) return invalid();
  return finish(await moveGroup(await getDb(), key, direction));
}

export async function createCaseAction(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  return finish(
    await createCase(await getDb(), str(fd, "groupKey"), {
      key: str(fd, "key").trim(),
      title: str(fd, "title"),
      description: str(fd, "description"),
      acceptanceCriteria: criteria(fd),
      reference: str(fd, "reference") || undefined,
    }),
  );
}

/** A `groupKey` other than the case's own moves it to the end of that group. */
export async function updateCaseAction(fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const groupKey = str(fd, "groupKey");
  const res = await updateCase(
    await getDb(),
    str(fd, "key"),
    {
      title: str(fd, "title"),
      description: str(fd, "description"),
      acceptanceCriteria: criteria(fd),
      reference: str(fd, "reference"),
      ...(groupKey ? { groupKey } : {}),
    },
    { userId: admin.id, name: admin.name },
  );
  return finish(res.ok ? { ok: true } : res);
}

export async function setCaseArchivedAction(key: string, archived: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (typeof key !== "string" || typeof archived !== "boolean") return invalid();
  return finish(await setCaseArchived(await getDb(), key, archived));
}

export async function moveCaseAction(key: string, direction: Direction): Promise<ActionResult> {
  await requireAdmin();
  if (typeof key !== "string" || !isDirection(direction)) return invalid();
  return finish(await moveCase(await getDb(), key, direction));
}
