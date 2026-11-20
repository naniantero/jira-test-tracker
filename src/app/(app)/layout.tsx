import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { AdminNav } from "@/components/shell/admin-nav";
import { Brand } from "@/components/shell/brand";
import { UserMenu } from "@/components/shell/user-menu";
import { StatusProgress } from "@/components/status/status-progress";
import { Panel } from "@/components/ui/panel";
import { Text } from "@/components/ui/text";
import { requireUser } from "@/lib/auth/session";
import { loadTree } from "@/lib/content/load";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const t = await getTranslations("header");
  const {
    tree: { overall },
  } = await loadTree("all");

  const page = (
    <>
      <header className="dark sticky top-0 z-40 bg-header text-foreground shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:gap-x-4">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Brand />
          </Link>
          {user.role === "admin" && (
            <AdminNav className="order-last -mx-2 w-full overflow-x-auto sm:order-none sm:mx-0 sm:w-auto" />
          )}
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Text tabular render={<span />} className="whitespace-nowrap">
                <span className="font-semibold">
                  {overall.tested}/{overall.total}
                </span>{" "}
                <Text variant="muted" render={<span />}>
                  {t("tested")}
                </Text>
              </Text>
              <StatusProgress counts={overall} className="w-14 sm:w-32" />
            </div>
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-2 py-4 sm:px-4 sm:py-6">
        <Panel>{children}</Panel>
      </main>
    </>
  );
  // The root layout sends only the public messages; admins also get the admin-only ones.
  return user.role === "admin" ? (
    <NextIntlClientProvider messages={await getMessages()}>{page}</NextIntlClientProvider>
  ) : (
    page
  );
}
