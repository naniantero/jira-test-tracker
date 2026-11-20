"use client";

import { useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { Failure } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import {
  fileTooLargeError,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_COMMENT,
  tooManyFilesError,
} from "@/lib/attachments/limits";

/** A browser hint only; the server checks file contents. */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,.txt,.log,video/mp4";

/** Adds files while they fit the limits; reports the first one that does not (same error as the server). */
export function mergeFiles(current: File[], incoming: File[]): { files: File[]; error: Failure | null } {
  const files = [...current];
  for (const file of incoming) {
    if (files.length >= MAX_ATTACHMENTS_PER_COMMENT) return { files, error: tooManyFilesError() };
    if (file.size > MAX_ATTACHMENT_BYTES) return { files, error: fileTooLargeError(file.name) };
    files.push(file);
  }
  return { files, error: null };
}

/** Thumbnail from a blob URL that lives exactly as long as the <img> (ref cleanup, StrictMode-safe). */
function BlobThumbnail({ file }: { file: File }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise
    <img
      alt=""
      className="size-8 shrink-0 rounded object-cover"
      ref={(img) => {
        if (!img) return;
        const url = URL.createObjectURL(file);
        img.src = url;
        return () => URL.revokeObjectURL(url);
      }}
    />
  );
}

/**
 * File button plus chips for the chosen files. Drag-and-drop and paste are wired by the comment form,
 * which passes everything through `onAdd` so all three paths share the same limits.
 */
export function AttachmentPicker({
  files,
  onAdd,
  onRemove,
  disabled,
}: {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("attachments");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      {files.length > 0 && (
        <ul aria-label={t("list")} className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
              className="flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-1.5 text-xs"
            >
              {file.type.startsWith("image/") ? (
                <BlobThumbnail file={file} />
              ) : (
                <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label={t("remove", { name: file.name })}
                onClick={() => onRemove(i)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label={t("input")}
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            onAdd(Array.from(e.target.files ?? []));
            e.target.value = ""; // allow picking the same file again after removing it
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || files.length >= MAX_ATTACHMENTS_PER_COMMENT}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip aria-hidden />
          {t("attach")}
        </Button>
        <Text variant="caption" render={<span />}>
          {t("hint", { max: MAX_ATTACHMENTS_PER_COMMENT })}
        </Text>
      </div>
    </div>
  );
}
