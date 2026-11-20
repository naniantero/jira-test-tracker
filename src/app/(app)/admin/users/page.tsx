import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { AddUserDialog, UserRowActions } from "./user-dialogs";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("users"))("title") };
}

export default async function AdminUsersPage() {
  const current = await requireAdmin();
  const tr = await getTranslations("users");
  const { orm, t } = await getDb();
  const users = await orm
    .select({
      id: t.user.id,
      username: t.user.username,
      name: t.user.name,
      role: t.user.role,
      createdAt: t.user.createdAt,
    })
    .from(t.user)
    .orderBy(asc(t.user.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Heading variant="page">{tr("title")}</Heading>
        <AddUserDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tr("username")}</TableHead>
            <TableHead>{tr("name")}</TableHead>
            <TableHead>{tr("role")}</TableHead>
            <TableHead>{tr("created")}</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">{tr("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const username = u.username ?? "";
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <Text variant="strong" render={<span />}>
                    {username}
                  </Text>
                </TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    {u.role === "admin" ? tr("admin") : tr("tester")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Text variant="muted" render={<span />}>
                    {formatDate(u.createdAt)}
                  </Text>
                </TableCell>
                <TableCell>
                  <UserRowActions userId={u.id} username={username} isSelf={u.id === current.id} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
