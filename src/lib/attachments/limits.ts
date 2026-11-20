import type { Failure } from "@/lib/errors";

/** Attachment limits and their errors; shared by the server (storage) and the browser (picker). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_COMMENT = 5;

export const tooManyFilesError = (): Failure => ({
  ok: false,
  error: "tooManyFiles",
  values: { max: MAX_ATTACHMENTS_PER_COMMENT },
});
export const fileTooLargeError = (name: string): Failure => ({ ok: false, error: "fileTooLarge", values: { name } });
