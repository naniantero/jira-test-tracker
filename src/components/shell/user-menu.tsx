"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/auth-client";
import type { CurrentUser } from "@/lib/auth/session";

export function UserMenu({ user }: { user: Pick<CurrentUser, "name" | "username" | "role"> }) {
  const router = useRouter();
  const t = useTranslations("userMenu");
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const { error } = await authClient.signOut();
    if (error) {
      setSigningOut(false);
      toast.error(t("signOutFailed"));
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" />}>
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold uppercase"
        >
          {user.name.trim().charAt(0) || "?"}
        </span>
        <span className="sr-only max-w-40 truncate sm:not-sr-only">{user.name}</span>
        <ChevronDown aria-hidden data-icon="inline-end" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="flex flex-col gap-0.5">
              <span className="truncate text-sm text-foreground">{user.name}</span>
              <span className="truncate font-normal">
                {user.username} · {user.role === "admin" ? t("admin") : t("tester")}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={signOut}>
          <LogOut aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
