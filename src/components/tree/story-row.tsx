import { useTranslations } from "next-intl";
import { StoryLink } from "@/components/tree/story-link";
import { StoryStatusMenu } from "@/components/tree/story-status-menu";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import type { Role } from "@/lib/stories/status";
import type { TreeFilter, StoryListItem } from "@/lib/stories/queries";

/**
 * One story: the link (stretched over the whole row) opens the same view with `?story=KEY`, keeping the active
 * tab; the status badge on top of it is a menu that changes the status without opening the sheet.
 */
export function StoryRow({
  story,
  tab,
  showChanged,
  role,
  attachmentsEnabled,
}: {
  story: StoryListItem;
  tab: TreeFilter;
  showChanged: boolean;
  role: Role;
  attachmentsEnabled: boolean;
}) {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("tab", tab);
  params.set("story", story.key);
  return (
    <div
      data-story-row={story.key}
      className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm even:bg-foreground/3 hover:bg-accent has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 has-[a[aria-current]]:bg-accent"
    >
      <StoryLink
        storyKey={story.key}
        href={`/?${params}`}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 outline-none after:absolute after:inset-0 after:rounded-lg"
      >
        <Text variant="code" render={<span />} className="w-16 shrink-0">
          {story.key}
        </Text>
        <Text render={<span />} className="min-w-0 flex-1 basis-48">
          {story.title}
        </Text>
        {showChanged && story.contentChangedAt && <ChangedBadge />}
      </StoryLink>
      <StoryStatusMenu
        storyKey={story.key}
        storyTitle={story.title}
        status={story.status}
        contentVersion={story.contentVersion}
        date={story.statusChangedAt}
        role={role}
        attachmentsEnabled={attachmentsEnabled}
      />
    </div>
  );
}

/** Its own component so only admins, who get the `changed` messages, ever look them up. */
function ChangedBadge() {
  const t = useTranslations("changed");
  return <Badge variant="secondary">{t("sinceTested")}</Badge>;
}
