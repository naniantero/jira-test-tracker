"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { STATUS_META } from "@/components/status/status-meta";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoryStatus, TransitionTarget } from "@/lib/stories/status";
import { CommentForm } from "./comment-form";
import { useStoryEvent } from "./use-story-event";

/**
 * Status buttons (from `allowedTargets`; admin overrides under "More") and the comment form. A target
 * that needs no comment submits at once when the box is empty; otherwise the form switches to it.
 */
export function StoryActions({
  storyKey,
  status,
  contentVersion,
  targets,
  attachmentsEnabled,
}: {
  storyKey: string;
  /** The status this sheet shows; sent as `expectedStatus` to detect concurrent changes. */
  status: StoryStatus;
  /** The content version this sheet shows; sent as `contentVersion` so a status change can't land on edited text. */
  contentVersion: number;
  targets: TransitionTarget[];
  attachmentsEnabled: boolean;
}) {
  const t = useTranslations("actions");
  const [chosen, setMode] = useState<TransitionTarget | null>(null);
  // After a refresh the chosen action may no longer apply to the new status; the typed text stays.
  const mode = (chosen && targets.find((t) => t.status === chosen.status)) ?? null;
  const event = useStoryEvent({ storyKey, status, contentVersion, attachmentsEnabled, onSaved: () => setMode(null) });
  const { pending, submitting, textareaRef } = event;

  const normal = targets.filter((t) => !t.override);
  const overrides = targets.filter((t) => t.override);

  function choose(target: TransitionTarget) {
    if (!target.commentRequired && event.isEmpty) {
      event.submit(target);
      return;
    }
    setMode(target);
    event.setError(null);
    // After the menu/button has released focus.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="space-y-3">
      {targets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {normal.map((target) => {
            const meta = STATUS_META[target.status];
            const Icon = meta.icon;
            const busy = pending && mode === null && submitting === target.status;
            return (
              <Button
                key={target.status}
                type="button"
                variant="outline"
                size="lg"
                status={target.status}
                disabled={pending}
                aria-pressed={mode?.status === target.status}
                onClick={() => choose(target)}
              >
                {busy ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Icon aria-hidden className={meta.textClass} />
                )}
                {t(`targets.${target.status}`)}
              </Button>
            );
          })}
          {overrides.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="lg" disabled={pending} />}>
                {t("more")}
                <ChevronDown aria-hidden className="text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-auto min-w-44">
                {overrides.map((target) => {
                  const Icon = STATUS_META[target.status].icon;
                  return (
                    <DropdownMenuItem key={target.status} onClick={() => choose(target)}>
                      <Icon aria-hidden className={STATUS_META[target.status].textClass} />
                      {t(`targets.${target.status}`)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      <CommentForm
        mode={
          mode && {
            heading: t(`headings.${mode.status}`),
            submitLabel: t(`headings.${mode.status}`),
            commentRequired: mode.commentRequired,
            placeholder: t(`placeholders.${mode.status}`),
          }
        }
        comment={event.comment}
        onCommentChange={event.setComment}
        attachmentsEnabled={attachmentsEnabled}
        files={event.files}
        onAddFiles={event.addFiles}
        onRemoveFile={event.removeFile}
        error={event.error}
        pending={pending}
        busy={pending && submitting === (mode?.status ?? "comment")}
        onSubmit={() => event.submit(mode)}
        onCancel={() => {
          setMode(null);
          event.setError(null);
        }}
        textareaRef={textareaRef}
      />
    </div>
  );
}
