import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { ProgressCounts } from "@/lib/stories/progress";
import { cn } from "@/lib/utils";
import { STATUS_META } from "./status-meta";

const SEGMENTS = ["passed", "failed", "retest"] as const;

/** Stacked bar of passed / issue / retest over the total; the untested rest stays empty. */
export function StatusProgress({ counts, className }: { counts: ProgressCounts; className?: string }) {
  const t = useTranslations("status");
  return (
    <div
      role="img"
      aria-label={t("progress", { tested: counts.tested, total: counts.total })}
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {counts.total > 0 &&
        SEGMENTS.map((s) =>
          counts[s] > 0 ? (
            <span
              key={s}
              data-status={s}
              className={cn("h-full w-(--segment-width) transition-all duration-500", STATUS_META[s].solidClass)}
              style={{ "--segment-width": `${(counts[s] / counts.total) * 100}%` } as CSSProperties}
            />
          ) : null,
        )}
    </div>
  );
}
