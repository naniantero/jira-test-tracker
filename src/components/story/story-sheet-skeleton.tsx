import { useTranslations } from "next-intl";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder in the story sheet's layout while the story loads; the title names the dialog for screen readers. */
export function StorySheetSkeleton() {
  const t = useTranslations("story");
  return (
    <div aria-busy className="flex flex-1 flex-col">
      <SheetHeader variant="divided">
        <SheetTitle className="sr-only">{t("loading")}</SheetTitle>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-5 w-28" />
      </SheetHeader>
      <div className="flex-1 space-y-6 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
