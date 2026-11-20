import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Heading } from "@/components/ui/heading";
import { requireAdmin } from "@/lib/auth/session";
import { listCases, listGroups } from "@/lib/cases";
import { getDb } from "@/lib/db";
import { CaseBoard } from "./case-board";
import { GroupDialog } from "./case-dialogs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cases"))("title") };
}

export default async function AdminCasesPage({ searchParams }: PageProps<"/admin/cases">) {
  await requireAdmin();
  const t = await getTranslations("cases");
  const showArchived = (await searchParams).archived === "1";
  const db = await getDb();
  const filter = showArchived ? {} : { archived: false };
  const [groups, cases] = await Promise.all([listGroups(db, filter), listCases(db, filter)]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Heading variant="page">{t("title")}</Heading>
        <GroupDialog />
      </div>
      <CaseBoard groups={groups} cases={cases} showArchived={showArchived} />
    </div>
  );
}
