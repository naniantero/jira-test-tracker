"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";

/** Previous, numbered and next buttons for paging held in state; renders nothing for a single page. */
export function PageButtons({
  page,
  pageCount,
  onPageChange,
  label,
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label: string;
  className?: string;
}) {
  const t = useTranslations("tree");
  if (pageCount <= 1) return null;
  return (
    <Pagination className={className} aria-label={label}>
      <PaginationContent>
        <PaginationItem>
          <Button
            type="button"
            variant="ghost"
            aria-label={t("previousPage")}
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            {t("previous")}
          </Button>
        </PaginationItem>
        {Array.from({ length: pageCount }, (_, i) => (
          <PaginationItem key={i}>
            <Button
              type="button"
              size="icon"
              variant={i === page ? "outline" : "ghost"}
              aria-label={t("goToPage", { page: i + 1 })}
              aria-current={i === page ? "page" : undefined}
              onClick={() => onPageChange(i)}
            >
              {i + 1}
            </Button>
          </PaginationItem>
        ))}
        <PaginationItem>
          <Button
            type="button"
            variant="ghost"
            aria-label={t("nextPage")}
            disabled={page === pageCount - 1}
            onClick={() => onPageChange(page + 1)}
          >
            {t("next")}
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
