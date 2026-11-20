"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition, useOptimistic } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TreeFilter } from "@/lib/stories/queries";

const FILTERS: TreeFilter[] = ["all", "untested", "issues", "retest", "changed"];

/**
 * Filter tabs; each is a link to `/?tab=…`, so the active filter lives in the URL. The clicked tab turns active
 * at once, and `data-pending` is set until the view has loaded, for ancestors to style against.
 */
export function StatusTabs({
  active,
  counts,
}: {
  active: TreeFilter;
  /** Only the tabs to show; the page omits `changed` for non-admins. */
  counts: Partial<Record<TreeFilter, number>>;
}) {
  const t = useTranslations("tree.tabs");
  const router = useRouter();
  const [shown, setShown] = useOptimistic(active);
  const [pending, setPending] = useOptimistic(false);
  const tabs = FILTERS.filter((f) => counts[f] !== undefined);
  return (
    <Tabs
      value={shown}
      data-pending={pending ? "" : undefined}
      className="max-w-full overflow-x-auto overflow-y-hidden"
    >
      <TabsList>
        {tabs.map((f) => {
          const href = f === "all" ? "/" : `/?tab=${f}`;
          return (
            <TabsTrigger
              key={f}
              value={f}
              nativeButton={false}
              render={
                <Link
                  href={href}
                  scroll={false}
                  onNavigate={(e) => {
                    e.preventDefault();
                    startTransition(() => {
                      setShown(f);
                      setPending(true);
                      router.push(href, { scroll: false });
                    });
                  }}
                />
              }
            >
              {f === "changed" ? <ChangedTabLabel count={counts[f] ?? 0} /> : t(f, { count: counts[f] ?? 0 })}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

/** Only admins get the Changed tab, and with it the `changed` messages. */
function ChangedTabLabel({ count }: { count: number }) {
  const t = useTranslations("changed");
  return t("tab", { count });
}
