import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Brand } from "@/components/shell/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("login"))("title") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand className="text-lg" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle size="lg">{t("heading")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
