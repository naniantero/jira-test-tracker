"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/cases", label: "cases" },
  { href: "/admin/users", label: "users" },
] as const;

export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const t = useTranslations("adminNav");
  return (
    <nav aria-label={t("label")} className={cn("flex items-center gap-1", className)}>
      {LINKS.map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground",
              active && "bg-muted text-foreground",
            )}
          >
            {t(l.label)}
          </Link>
        );
      })}
    </nav>
  );
}
