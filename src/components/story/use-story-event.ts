"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { submitStoryEvent } from "@/app/(app)/story-actions";
import { celebrate } from "@/components/celebrate";
import type { StoryStatus, TransitionTarget } from "@/lib/stories/status";
import { mergeFiles } from "./attachment-picker";

/**
 * Comment, files and submit for one story's status change or comment, shared by the sheet and the tree row.
 * `status` and `contentVersion` are the status and content version on screen, sent as `expectedStatus` and
 * `contentVersion` to detect concurrent changes and edits. `onSaved` runs after
 * a successful submit, once the comment and files are cleared.
 */
export function useStoryEvent({
  storyKey,
  status,
  contentVersion,
  attachmentsEnabled,
  onSaved,
}: {
  storyKey: string;
  status: StoryStatus;
  contentVersion: number;
  attachmentsEnabled: boolean;
  onSaved?: () => void;
}) {
  const t = useTranslations("actions");
  const tStory = useTranslations("story");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [comment, setCommentValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Which submit is in flight; it falls back to null when the transition ends.
  const [submitting, setSubmitting] = useOptimistic<StoryStatus | "comment" | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = comment.trim() === "" && files.length === 0;

  function submit(target: TransitionTarget | null) {
    if (target?.commentRequired && comment.trim() === "") {
      setError(tErrors("commentRequired"));
      textareaRef.current?.focus();
      return;
    }
    if (!target && isEmpty) {
      setError(attachmentsEnabled ? t("writeCommentOrFile") : t("writeComment"));
      textareaRef.current?.focus();
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("storyKey", storyKey);
    formData.set("expectedStatus", status);
    formData.set("contentVersion", String(contentVersion));
    formData.set("toStatus", target?.status ?? "");
    formData.set("comment", comment);
    for (const f of files) formData.append("files", f);

    startTransition(async () => {
      setSubmitting(target?.status ?? "comment");
      try {
        const result = await submitStoryEvent(formData);
        if (!result.ok) {
          toast.error(result.error);
          // Pull the latest status into the page; the typed comment and picked files survive for a retry
          // (a browser reload would lose them).
          router.refresh();
          return;
        }
        setCommentValue("");
        setFiles([]);
        onSaved?.();
        if (result.epicCompleted) celebrate(tStory("epicComplete", { title: result.epicCompleted.title }));
      } catch {
        toast.error(tStory("saveFailed"));
      }
    });
  }

  function addFiles(incoming: File[]) {
    const merged = mergeFiles(files, incoming);
    setFiles(merged.files);
    if (merged.error) toast.error(tErrors(merged.error.error, merged.error.values));
  }

  return {
    comment,
    setComment(value: string) {
      setCommentValue(value);
      if (error) setError(null);
    },
    files,
    addFiles,
    removeFile: (index: number) => setFiles((fs) => fs.filter((_, j) => j !== index)),
    error,
    setError,
    isEmpty,
    pending,
    submitting,
    submit,
    textareaRef,
  };
}
