import { History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/status/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Heading } from "@/components/ui/heading";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { loadStory } from "@/lib/content/load";
import { formatDate } from "@/lib/format";
import { allowedTargets, type Role } from "@/lib/stories/status";
import { ContentChangeActions } from "./content-change-actions";
import { Markdown } from "./markdown";
import { StoryActions } from "./story-actions";
import { StoryReference } from "./story-reference";
import { StoryTimeline } from "./story-timeline";

/**
 * Server-rendered story details for the client sheet frame; it loads the story itself, so the page streams it
 * behind a Suspense boundary. Client components only receive what they need: admin-only data (the
 * "Changed since tested" alert and its controls) is rendered for admins only and `contentChangedAt` never
 * becomes a client prop. Unknown and archived keys show "not found".
 */
export async function StorySheet({
  storyKey,
  role,
  attachmentsEnabled,
}: {
  storyKey: string;
  role: Role;
  /** An attachment bucket is configured: without one the form takes no files and the timeline shows none. */
  attachmentsEnabled: boolean;
}) {
  const [{ story }, t, tChanged] = await Promise.all([
    loadStory(storyKey),
    getTranslations("story"),
    getTranslations("changed"),
  ]);
  if (!story || story.archived) {
    return (
      <SheetHeader>
        <SheetTitle size="lg">{t("notFound")}</SheetTitle>
        <SheetDescription>{t("notFoundDescription")}</SheetDescription>
      </SheetHeader>
    );
  }

  const isAdmin = role === "admin";
  const targets = allowedTargets(story.status, role);

  return (
    <>
      <SheetHeader variant="divided">
        <Text variant="caption" render={<div />}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="code" render={<span />}>
              {story.key}
            </Text>
            <span aria-hidden>·</span>
            <span>{story.epicTitle}</span>
            {story.reference && <span aria-hidden>·</span>}
            {story.reference && <StoryReference reference={story.reference} />}
          </div>
        </Text>
        <SheetTitle size="lg">{story.title}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={story.status} date={story.statusChangedAt} />
          {story.statusChangedByName && (
            <Text variant="caption" render={<span />}>
              {t("changedBy", { name: story.statusChangedByName })}
            </Text>
          )}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {isAdmin && story.contentChangedAt && (
          <Alert>
            <History aria-hidden />
            <AlertTitle>{tChanged("sinceTested")}</AlertTitle>
            <AlertDescription className="[&_p:not(:last-child)]:mb-2">
              <p>{tChanged("on", { date: formatDate(story.contentChangedAt) })}</p>
              <ContentChangeActions storyKey={story.key} status={story.status} contentVersion={story.contentVersion} />
            </AlertDescription>
          </Alert>
        )}

        {story.description && (
          <section aria-labelledby="story-description" className="space-y-1.5">
            <Heading id="story-description">{t("description")}</Heading>
            <Markdown source={story.description} />
          </section>
        )}

        {story.acceptanceCriteria.length > 0 && (
          <section aria-labelledby="story-criteria" className="space-y-1.5">
            <Heading id="story-criteria">{t("criteria")}</Heading>
            <ul className="space-y-1.5">
              {story.acceptanceCriteria.map((c, i) => (
                <li key={i} className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <span aria-hidden className="pt-px text-xs font-medium text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  <Markdown source={c} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!story.description && story.acceptanceCriteria.length === 0 && (
          <Text variant="muted">{t("noDescription")}</Text>
        )}

        <StoryActions
          storyKey={story.key}
          status={story.status}
          contentVersion={story.contentVersion}
          targets={targets}
          attachmentsEnabled={attachmentsEnabled}
        />

        <StoryTimeline events={story.timeline} showAttachments={attachmentsEnabled} />
      </div>
    </>
  );
}
