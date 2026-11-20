import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { StorySheet } from "@/components/story/story-sheet";
import { StorySheetProvider } from "@/components/story/story-sheet-frame";
import { StorySheetSkeleton } from "@/components/story/story-sheet-skeleton";
import { EpicRow } from "@/components/tree/epic-row";
import { StatusTabs } from "@/components/tree/status-tabs";
import { StoryRow } from "@/components/tree/story-row";
import { requireUser } from "@/lib/auth/session";
import { loadTree } from "@/lib/content/load";
import { getEnv } from "@/lib/env";
import { PAGE_SIZE } from "@/lib/paging";
import type { TreeFilter } from "@/lib/stories/queries";

const FILTERS: TreeFilter[] = ["all", "untested", "issues", "retest", "changed"];

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("tree");
  const isAdmin = user.role === "admin";
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const candidate = FILTERS.find((f) => f === rawTab) ?? "all";
  const tab: TreeFilter = candidate === "changed" && !isAdmin ? "all" : candidate;
  const rawStory = Array.isArray(sp.story) ? sp.story[0] : sp.story;

  const { tree } = await loadTree(tab);
  // Client components only get what they render: no admin-only counts or markers for testers.
  const { changed, ...testerCounts } = tree.tabCounts;
  const counts = isAdmin ? { ...testerCounts, changed } : testerCounts;
  const noEpicsAtAll = tab === "all" && tree.epics.length === 0;
  const attachmentsEnabled = getEnv().ATTACHMENTS_BUCKET_URL !== undefined;

  return (
    <StorySheetProvider
      storyKey={rawStory ?? null}
      closeHref={tab === "all" ? "/" : `/?tab=${tab}`}
      sheet={
        rawStory && (
          <Suspense key={rawStory} fallback={<StorySheetSkeleton />}>
            <StorySheet storyKey={rawStory} role={user.role} attachmentsEnabled={attachmentsEnabled} />
          </Suspense>
        )
      }
    >
      <div className="group/view space-y-4">
        <StatusTabs active={tab} counts={counts} />
        {/* Dimmed while another tab's view loads. */}
        <div className="transition-opacity group-has-data-pending/view:opacity-60">
          {noEpicsAtAll ? (
            <p className="py-8 text-center text-muted-foreground">{t("empty")}</p>
          ) : tree.epics.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t("emptyView")}</p>
          ) : (
            <div className="space-y-2">
              {tree.epics.map((epic) => {
                const selectedIndex = rawStory ? epic.stories.findIndex((s) => s.key === rawStory) : -1;
                const selectedPage = selectedIndex < 0 ? null : Math.floor(selectedIndex / PAGE_SIZE);
                return (
                  <EpicRow
                    key={epic.id}
                    selectedPage={selectedPage}
                    epic={{ key: epic.key, title: epic.title, progress: epic.progress }}
                  >
                    {epic.stories.map((s) => (
                      <StoryRow
                        key={s.id}
                        story={s}
                        tab={tab}
                        showChanged={isAdmin}
                        role={user.role}
                        attachmentsEnabled={attachmentsEnabled}
                      />
                    ))}
                  </EpicRow>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StorySheetProvider>
  );
}
