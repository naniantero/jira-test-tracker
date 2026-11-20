"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";

function messageFor(status: number | undefined): "rateLimited" | "unavailable" | "invalid" {
  if (status === 429) return "rateLimited";
  if (status === undefined || status >= 500) return "unavailable";
  return "invalid";
}

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    let status: number | undefined;
    try {
      const res = await authClient.signIn.username({
        username: String(fd.get("username") ?? "").trim(),
        password: String(fd.get("password") ?? ""),
      });
      if (!res.error) {
        router.replace("/");
        return; // stay pending until the navigation replaces this page
      }
      status = res.error.status;
    } catch {
      status = undefined;
    }
    setError(t(messageFor(status)));
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">{t("username")}</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending && <Loader2 aria-hidden className="animate-spin" />}
        {t("submit")}
      </Button>
    </form>
  );
}
