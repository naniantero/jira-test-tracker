"use server";

import { revalidatePath } from "next/cache";
import { translateFailure } from "@/i18n/errors";
import { getAttachmentStore } from "@/lib/attachments/bucket";
import { removeStoredFiles, validateAndStoreFiles, type StoredFile } from "@/lib/attachments/storage";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dismissContentChange, recordStoryEvent } from "@/lib/stories/events";
import { STATUSES, type StoryStatus } from "@/lib/stories/status";

type Failure = { ok: false; error: string };

export type SubmitStoryEventResult = { ok: true; epicCompleted: { key: string; title: string } | null } | Failure;

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** A whole number, as the sheet and the tree row send `contentVersion`; anything else is `null`. */
function parseVersion(v: string): number | null {
  return /^\d+$/.test(v) ? Number(v) : null;
}

function parseStatus(v: string): StoryStatus | null {
  return (STATUSES as readonly string[]).includes(v) ? (v as StoryStatus) : null;
}

/**
 * Status change and/or comment with attachments. Fields: `storyKey`, `expectedStatus` (the status the
 * sheet showed; a mismatch means someone else changed it), `contentVersion` (the content version it showed;
 * a mismatch refuses a status change), `toStatus` (`""` = comment only), `comment`, `files` (multiple).
 * Files are validated and stored first, then removed again if the event is rejected.
 */
export async function submitStoryEvent(formData: FormData): Promise<SubmitStoryEventResult> {
  const user = await requireUser();
  const storyKey = field(formData, "storyKey").trim();
  const expectedStatus = parseStatus(field(formData, "expectedStatus"));
  const expectedContentVersion = parseVersion(field(formData, "contentVersion"));
  const rawTo = field(formData, "toStatus");
  const toStatus = rawTo === "" ? null : parseStatus(rawTo);
  if (!storyKey || !expectedStatus || expectedContentVersion === null || (rawTo !== "" && !toStatus))
    return translateFailure({ ok: false, error: "notAllowed" });

  // An empty <input type="file"> submits one nameless, empty part; real files always have a name.
  const files = formData
    .getAll("files")
    .filter((f): f is File => typeof f !== "string" && !(f.name === "" && f.size === 0));

  const store = getAttachmentStore();
  let stored: StoredFile[] = [];
  if (files.length > 0) {
    if (!store) return translateFailure({ ok: false, error: "attachmentsDisabled" });
    const inputs = await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const saved = await validateAndStoreFiles(store, inputs);
    if (!saved.ok) return translateFailure(saved);
    stored = saved.stored;
  }
  const storedNames = stored.map((s) => s.storageName);

  let result: Awaited<ReturnType<typeof recordStoryEvent>>;
  try {
    result = await recordStoryEvent(await getDb(), {
      storyKey,
      actor: { id: user.id, name: user.name, role: user.role },
      expectedStatus,
      expectedContentVersion,
      toStatus,
      comment: field(formData, "comment"),
      files: stored,
    });
  } catch (err) {
    if (store) await removeStoredFiles(store, storedNames);
    throw err;
  }
  if (!result.ok) {
    if (store) await removeStoredFiles(store, storedNames);
    return translateFailure(result);
  }
  revalidatePath("/");
  return { ok: true, epicCompleted: result.epicCompleted };
}

/** Admin "Keep status": clears the "Changed since tested" marker and notes it on the timeline. */
export async function dismissContentChangeAction(formData: FormData): Promise<{ ok: true } | Failure> {
  const admin = await requireAdmin();
  const storyKey = field(formData, "storyKey").trim();
  if (!storyKey) return translateFailure({ ok: false, error: "storyNotFound" });
  const result = await dismissContentChange(await getDb(), {
    storyKey,
    actor: { id: admin.id, name: admin.name, role: admin.role },
  });
  if (!result.ok) return translateFailure(result);
  revalidatePath("/");
  return result;
}
