import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** App mark + name, used in the header and on the login page. */
export function Brand({ className }: { className?: string }) {
  const t = useTranslations("app");
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
        <ListChecks className="size-4" />
      </span>
      {t("name")}
    </span>
  );
}
