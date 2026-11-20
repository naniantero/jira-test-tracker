"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status/status-badge";
import { STATUS_META } from "@/components/status/status-meta";
import { CommentForm } from "@/components/story/comment-form";
import { useStoryEvent } from "@/components/story/use-story-event";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { allowedTargets, type Role, type StoryStatus, type TransitionTarget } from "@/lib/stories/status";

/**
 * The tree row's status badge as a menu of the same transitions the sheet offers. A transition that needs a
 * comment (e.g. Report issue) asks for it in a dialog; the others save at once.
 */
export function StoryStatusMenu({
  storyKey,
  storyTitle,
  status,
  contentVersion,
  date,
  role,
  attachmentsEnabled,
}: {
  storyKey: string;
  storyTitle: string;
  status: StoryStatus;
  contentVersion: number;
  date: Date | null;
  role: Role;
  attachmentsEnabled: boolean;
}) {
  const t = useTranslations("actions");
  const tStatus = useTranslations("status");
  const [dialogTarget, setDialogTarget] = useState<TransitionTarget | null>(null);
  const event = useStoryEvent({
    storyKey,
    status,
    contentVersion,
    attachmentsEnabled,
    onSaved: () => setDialogTarget(null),
  });
  const targets = allowedTargets(status, role);
  const normal = targets.filter((t) => !t.override);
  const overrides = targets.filter((t) => t.override);
  const saving = event.pending && dialogTarget === null;

  function choose(target: TransitionTarget) {
    event.setError(null);
    if (target.commentRequired) setDialogTarget(target);
    else event.submit(target);
  }

  const item = (target: TransitionTarget) => {
    const Icon = STATUS_META[target.status].icon;
    return (
      <DropdownMenuItem key={target.status} onClick={() => choose(target)}>
        <Icon aria-hidden className={STATUS_META[target.status].textClass} />
        {t(`targets.${target.status}`)}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={event.pending}
          render={
            <StatusBadge
              status={status}
              date={date}
              menu
              className="relative"
              aria-label={tStatus("change", { key: storyKey, status: tStatus(status) })}
              render={<button type="button" />}
            />
          }
        />
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          {normal.map(item)}
          {normal.length > 0 && overrides.length > 0 && <DropdownMenuSeparator />}
          {overrides.map(item)}
        </DropdownMenuContent>
      </DropdownMenu>
      {saving && <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />}
      <Dialog
        open={dialogTarget !== null}
        onOpenChange={(open) => {
          if (!open && !event.pending) setDialogTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg" initialFocus={event.textareaRef}>
          {dialogTarget && (
            <>
              <DialogHeader>
                <DialogTitle>{t(`headings.${dialogTarget.status}`)}</DialogTitle>
                <DialogDescription>{`${storyKey} · ${storyTitle}`}</DialogDescription>
              </DialogHeader>
              <CommentForm
                mode={{
                  heading: t(`headings.${dialogTarget.status}`),
                  headingHidden: true,
                  submitLabel: t(`headings.${dialogTarget.status}`),
                  commentRequired: dialogTarget.commentRequired,
                  placeholder: t(`placeholders.${dialogTarget.status}`),
                }}
                comment={event.comment}
                onCommentChange={event.setComment}
                attachmentsEnabled={attachmentsEnabled}
                files={event.files}
                onAddFiles={event.addFiles}
                onRemoveFile={event.removeFile}
                error={event.error}
                pending={event.pending}
                busy={event.pending}
                onSubmit={() => event.submit(dialogTarget)}
                onCancel={() => setDialogTarget(null)}
                textareaRef={event.textareaRef}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
