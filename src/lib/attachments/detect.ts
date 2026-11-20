import { fileTypeFromBuffer } from "file-type";

export type DetectedFile = {
  mimeType: string;
  ext: string;
  kind: "image" | "pdf" | "text" | "video";
};

const BINARY_TYPES: Record<string, DetectedFile> = {
  "image/png": { mimeType: "image/png", ext: "png", kind: "image" },
  "image/jpeg": { mimeType: "image/jpeg", ext: "jpg", kind: "image" },
  "image/webp": { mimeType: "image/webp", ext: "webp", kind: "image" },
  "image/gif": { mimeType: "image/gif", ext: "gif", kind: "image" },
  "application/pdf": { mimeType: "application/pdf", ext: "pdf", kind: "pdf" },
  "video/mp4": { mimeType: "video/mp4", ext: "mp4", kind: "video" },
};

/** Verifies the file type by content, never by extension alone. SVG/HTML are never allowed. */
export async function detectAllowedType(bytes: Uint8Array, originalName: string): Promise<DetectedFile | null> {
  const detected = await fileTypeFromBuffer(bytes);
  if (detected) return BINARY_TYPES[detected.mime] ?? null;

  const lower = originalName.toLowerCase();
  if (!lower.endsWith(".txt") && !lower.endsWith(".log")) return null;
  if (bytes.includes(0)) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  return { mimeType: "text/plain", ext: "txt", kind: "text" };
}
