import { randomUUID } from "node:crypto";
import type { Failure } from "@/lib/errors";
import type { AttachmentStore } from "./bucket";
import { detectAllowedType } from "./detect";
import { fileTooLargeError, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_COMMENT, tooManyFilesError } from "./limits";

export { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_COMMENT } from "./limits";

export type AttachmentInput = { name: string; bytes: Uint8Array };
export type StoredFile = {
  storageName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

/** Makes the download name end in the content-verified extension, never the uploader's. */
export function normalizeOriginalName(name: string, ext: string, kind: string): string {
  const lower = name.toLowerCase();
  if (kind === "text" && (lower.endsWith(".txt") || lower.endsWith(".log"))) return name;
  const base = name.replace(/\.[^./\\]*$/, "");
  return `${base || "file"}.${ext}`;
}

/** Validates every file before writing any. */
export async function validateAndStoreFiles(
  store: AttachmentStore,
  files: AttachmentInput[],
): Promise<{ ok: true; stored: StoredFile[] } | Failure> {
  if (files.length > MAX_ATTACHMENTS_PER_COMMENT) {
    return tooManyFilesError();
  }
  const planned: { file: AttachmentInput; mimeType: string; ext: string; kind: string }[] = [];
  for (const file of files) {
    if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return fileTooLargeError(file.name);
    }
    const detected = await detectAllowedType(file.bytes, file.name);
    if (!detected) return { ok: false, error: "fileTypeNotAllowed", values: { name: file.name } };
    planned.push({ file, mimeType: detected.mimeType, ext: detected.ext, kind: detected.kind });
  }

  const stored: StoredFile[] = [];
  try {
    for (const { file, mimeType, ext, kind } of planned) {
      const storageName = `${randomUUID()}.${ext}`;
      await store.put(storageName, file.bytes, mimeType);
      stored.push({
        storageName,
        originalName: normalizeOriginalName(file.name, ext, kind),
        mimeType,
        sizeBytes: file.bytes.byteLength,
      });
    }
  } catch (err) {
    await removeStoredFiles(
      store,
      stored.map((s) => s.storageName),
    );
    throw err;
  }
  return { ok: true, stored };
}

export async function removeStoredFiles(store: AttachmentStore, storageNames: string[]): Promise<void> {
  await Promise.all(storageNames.map((n) => store.remove(n)));
}
