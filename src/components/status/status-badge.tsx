import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { StoryStatus } from "@/lib/stories/status";
import { STATUS_META } from "./status-meta";

/**
 * Status pill: coloured icon + label, plus ` · 17 Nov 2026` when a date is given. Other props go to the `Badge`,
 * so it can be a menu trigger; `menu` adds the chevron that shows it opens one.
 */
export function StatusBadge({
  status,
  date,
  menu = false,
  ...props
}: { status: StoryStatus; date?: Date | null; menu?: boolean } & Omit<
  ComponentProps<typeof Badge>,
  "variant" | "status" | "children"
>) {
  const t = useTranslations("status");
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="status" status={status} data-status={status} {...props}>
      <Icon aria-hidden className={meta.textClass} />
      <span>{date ? t("withDate", { status: t(status), date: formatDate(date) }) : t(status)}</span>
      {menu && <ChevronDown aria-hidden data-icon="inline-end" className="-ml-0.5 text-muted-foreground" />}
    </Badge>
  );
}
