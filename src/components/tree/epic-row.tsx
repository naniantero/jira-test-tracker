"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Children, useEffect, useState, type ReactNode } from "react";
import { StatusProgress } from "@/components/status/status-progress";
import { setOpenEpic, useOpenEpic } from "@/components/tree/open-epic";
import { PageButtons } from "@/components/tree/page-buttons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Text } from "@/components/ui/text";
import { PAGE_SIZE } from "@/lib/paging";
import type { ProgressCounts } from "@/lib/stories/progress";
/**
 * Collapsible epic: title, tested count and progress bar; stories are passed as children. Epics start closed and
 * one is open at a time; the epic holding the selected story opens.
 */
export function EpicRow({
  epic,
  children,
  selectedPage = null,
}: {
  epic: { key: string; title: string; progress: ProgressCounts };
  children: ReactNode;
  /** Page holding the selected story, or null when none of this epic's stories is selected. */
  selectedPage?: number | null;
}) {
  const t = useTranslations("tree");
  const { progress } = epic;
  const items = Children.toArray(children);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const [requested, setPage] = useState(selectedPage != null && Number.isFinite(selectedPage) ? selectedPage : 0);
  const [prevSelected, setPrevSelected] = useState(selectedPage);
  if (!Object.is(selectedPage, prevSelected)) {
    setPrevSelected(selectedPage);
    if (selectedPage !== null && Number.isFinite(selectedPage)) setPage(selectedPage);
  }
  const page = Math.min(Math.max(requested, 0), pageCount - 1);
  const go = (n: number) => setPage(Math.min(Math.max(n, 0), pageCount - 1));
  const open = useOpenEpic() === epic.key;
  const holdsSelection = selectedPage !== null && Number.isFinite(selectedPage);
  useEffect(() => {
    if (holdsSelection) setOpenEpic(epic.key);
  }, [holdsSelection, epic.key]);
  return (
    <Collapsible open={open} onOpenChange={(next) => setOpenEpic(next ? epic.key : null)} className="group/epic">
      <CollapsibleTrigger className="group/trigger flex w-full flex-col">
        <span className="flex w-full items-center gap-2">
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-0"
          />
          <span className="min-w-0 truncate font-semibold">{epic.title}</span>
          <Text variant="caption" render={<span />} className="shrink-0">
            {epic.key}
          </Text>
          <Text variant="muted" tabular render={<span />} className="ml-auto shrink-0">
            {t("testedCount", { tested: progress.tested, total: progress.total })}
          </Text>
        </span>
        <StatusProgress counts={progress} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">{items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}</div>
        <PageButtons
          className="mt-2"
          page={page}
          pageCount={pageCount}
          onPageChange={go}
          label={t("pagesLabel", { epic: epic.title })}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
