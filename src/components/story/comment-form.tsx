"use client";

import { useId, useRef, useState, type ClipboardEvent, type DragEvent, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AttachmentPicker } from "./attachment-picker";

/** Chrome names every pasted screenshot `image.png`; give them distinguishable names (`base`, e.g. "Pasted image 2"). */
function namePasted(file: File, base: string): File {
  if (file.name && file.name !== "image.png") return file;
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `${base}.${ext}`, { type: file.type, lastModified: file.lastModified });
}

/**
 * Comment box with attachments (file button, drag-and-drop onto the form, paste into the textarea), which
 * are left out when `attachmentsEnabled` is false.
 * Without a `mode` it posts a plain comment; with one (e.g. "Report issue") it confirms that change.
 */
export function CommentForm({
  mode,
  attachmentsEnabled,
  comment,
  onCommentChange,
  files,
  onAddFiles,
  onRemoveFile,
  error,
  pending,
  busy,
  onSubmit,
  onCancel,
  textareaRef,
}: {
  /** `headingHidden`: the heading is for screen readers only, e.g. in a dialog that shows its own title. */
  mode: {
    heading: string;
    headingHidden?: boolean;
    submitLabel: string;
    commentRequired: boolean;
    placeholder: string;
  } | null;
  attachmentsEnabled: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  error: string | null;
  /** Any submit of this story is in flight: inputs are locked. */
  pending: boolean;
  /** This form's own submit is in flight: shows the spinner. */
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("comment");
  const id = useId();
  const pastedCount = useRef(0);
  const [dragging, setDragging] = useState(false);

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length === 0 || !attachmentsEnabled) return; // plain text paste
    e.preventDefault();
    onAddFiles(pasted.map((f) => namePasted(f, t("pastedImage", { n: ++pastedCount.current }))));
  }

  const hasFiles = (e: DragEvent) => attachmentsEnabled && Array.from(e.dataTransfer.types).includes("Files");

  function onDragOver(e: DragEvent<HTMLFormElement>) {
    if (!hasFiles(e) || pending) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLFormElement>) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    if (!pending) onAddFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <form
      aria-labelledby={`${id}-heading`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "space-y-2 rounded-xl border p-3 transition-colors",
        mode ? "border-ring/60 bg-muted" : "border-border bg-muted/60",
        dragging && "border-dashed border-ring bg-muted",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        {mode ? (
          <Heading id={`${id}-heading`} className={mode.headingHidden ? "sr-only" : undefined}>
            {mode.heading}
          </Heading>
        ) : (
          <Heading id={`${id}-heading`} className="sr-only">
            {t("add")}
          </Heading>
        )}
        {mode?.commentRequired && (
          <Text variant="caption" render={<span />}>
            {t("required")}
          </Text>
        )}
      </div>
      <Label htmlFor={`${id}-comment`} className="sr-only">
        {t("label")}
      </Label>
      <Textarea
        ref={textareaRef}
        id={`${id}-comment`}
        name="comment"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={mode?.placeholder ?? (attachmentsEnabled ? t("placeholderWithPaste") : t("placeholder"))}
        maxLength={5000} /* = MAX_COMMENT_LENGTH (server module, not importable here) */
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-20"
      />
      {attachmentsEnabled && (
        <AttachmentPicker files={files} onAdd={onAddFiles} onRemove={onRemoveFile} disabled={pending} />
      )}
      {error && (
        <Text variant="error" id={`${id}-error`} role="alert">
          {error}
        </Text>
      )}
      <div className="flex justify-end gap-2 pt-1">
        {mode && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
        <Button type="submit" variant={mode ? "default" : "outline"} disabled={pending}>
          {busy && <Loader2 aria-hidden className="animate-spin" />}
          {mode ? mode.submitLabel : t("submit")}
        </Button>
      </div>
    </form>
  );
}
