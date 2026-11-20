"use client";

import { useTransition } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Text } from "@/components/ui/text";
import type { CaseSummary, GroupSummary } from "@/lib/cases";
import {
  loadCaseAction,
  loadGroupAction,
  moveCaseAction,
  moveGroupAction,
  setCaseArchivedAction,
  setGroupArchivedAction,
  type ActionResult,
} from "./actions";
import { EditCaseDialog, EditGroupDialog, NewCaseDialog, useEditDialog } from "./case-dialogs";

/** Runs a one-click Server Action; failures show as a toast. */
function useRun() {
  const tErrors = useTranslations("errors");
  const [pending, start] = useTransition();
  function run(action: () => Promise<ActionResult>, success?: string) {
    start(async () => {
      let res: ActionResult;
      try {
        res = await action();
      } catch {
        res = { ok: false, error: tErrors("generic") };
      }
      if (!res.ok) toast.error(res.error);
      else if (success) toast.success(success);
    });
  }
  return { pending, run };
}

/** Where an active item sits among the active ones, for the move up / down items; archived items do not move. */
function placeOf<T extends { key: string; archived: boolean }>(items: T[], key: string) {
  const active = items.filter((i) => !i.archived);
  const i = active.findIndex((a) => a.key === key);
  return { first: i <= 0, last: i < 0 || i === active.length - 1 };
}

/** Groups in order, each expanding to its cases; archived ones only with "Show archived" (`?archived=1`). */
export function CaseBoard({
  groups,
  cases,
  showArchived,
}: {
  groups: GroupSummary[];
  cases: CaseSummary[];
  showArchived: boolean;
}) {
  const t = useTranslations("cases");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const editGroup = useEditDialog(loadGroupAction, tErrors("groupNotFound"));
  const editCase = useEditDialog(loadCaseAction, tErrors("caseNotFound"));

  return (
    <div className="flex flex-col gap-3">
      <Label className="self-end">
        <Checkbox
          checked={showArchived}
          disabled={navigating}
          onCheckedChange={(on) =>
            startNav(() => router.replace(on ? "/admin/cases?archived=1" : "/admin/cases", { scroll: false }))
          }
        />
        {t("showArchived")}
      </Label>
      {groups.length === 0 ? (
        <Text variant="muted" className="my-4">
          {t("empty")}
        </Text>
      ) : (
        <div className="flex flex-col gap-1">
          {groups.map((g) => (
            <GroupSection
              key={g.key}
              group={g}
              place={placeOf(groups, g.key)}
              cases={cases.filter((c) => c.groupKey === g.key)}
              onEditGroup={() => editGroup.openFor(g.key)}
              onEditCase={editCase.openFor}
            />
          ))}
        </div>
      )}
      <EditGroupDialog group={editGroup.detail} open={editGroup.open} onOpenChange={editGroup.onOpenChange} />
      <EditCaseDialog
        value={editCase.detail}
        groups={groups}
        open={editCase.open}
        onOpenChange={editCase.onOpenChange}
      />
    </div>
  );
}

/** Collapsible group; "New test case" and the actions menu sit beside the trigger, so they never toggle it. */
function GroupSection({
  group,
  place,
  cases,
  onEditGroup,
  onEditCase,
}: {
  group: GroupSummary;
  place: { first: boolean; last: boolean };
  cases: CaseSummary[];
  onEditGroup: () => void;
  onEditCase: (key: string) => void;
}) {
  const t = useTranslations("cases");
  return (
    <Collapsible>
      <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-accent">
        <CollapsibleTrigger variant="inline" className="group/trigger flex min-w-0 flex-1 items-center">
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-0"
          />
          <span className="min-w-0 truncate">
            <Text variant="strong" render={<span />}>
              {group.title}
            </Text>
          </span>
          <Text variant="caption" render={<span />} className="shrink-0">
            {group.key}
          </Text>
          {group.archived && <Badge variant="secondary">{t("archived")}</Badge>}
          <Text variant="muted" tabular render={<span />} className="ml-auto shrink-0">
            {t("count", { count: cases.length })}
          </Text>
        </CollapsibleTrigger>
        {!group.archived && <NewCaseDialog group={group} />}
        <GroupActions group={group} place={place} onEdit={onEditGroup} />
      </div>
      <CollapsibleContent>
        {cases.length === 0 ? (
          <Text variant="muted" className="my-2 mr-3 ml-9">
            {t("noCases")}
          </Text>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("key")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.key}>
                  <TableCell>
                    <Text variant="code" render={<span />}>
                      {c.key}
                    </Text>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-wrap items-center gap-2">
                      {c.title}
                      {c.archived && <Badge variant="secondary">{t("archived")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>
                    <CaseActions item={c} place={placeOf(cases, c.key)} onEdit={() => onEditCase(c.key)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function RowMenu({
  label,
  archived,
  place,
  pending,
  onEdit,
  onMove,
  onArchive,
}: {
  label: string;
  archived: boolean;
  place: { first: boolean; last: boolean };
  pending: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onArchive: (archived: boolean) => void;
}) {
  const t = useTranslations("cases");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} disabled={pending} />}>
        <MoreHorizontal aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>{t("edit")}</DropdownMenuItem>
        {!archived && (
          <>
            <DropdownMenuItem disabled={place.first} onClick={() => onMove("up")}>
              {t("moveUp")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={place.last} onClick={() => onMove("down")}>
              {t("moveDown")}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {archived ? (
          <DropdownMenuItem onClick={() => onArchive(false)}>{t("restore")}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onClick={() => onArchive(true)}>
            {t("archive")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupActions({
  group,
  place,
  onEdit,
}: {
  group: GroupSummary;
  place: { first: boolean; last: boolean };
  onEdit: () => void;
}) {
  const t = useTranslations("cases");
  const { pending, run } = useRun();
  return (
    <RowMenu
      label={t("actionsFor", { key: group.key })}
      archived={group.archived}
      place={place}
      pending={pending}
      onEdit={onEdit}
      onMove={(d) => run(() => moveGroupAction(group.key, d))}
      onArchive={(a) =>
        run(() => setGroupArchivedAction(group.key, a), t(a ? "archivedKey" : "restoredKey", { key: group.key }))
      }
    />
  );
}

function CaseActions({
  item,
  place,
  onEdit,
}: {
  item: CaseSummary;
  place: { first: boolean; last: boolean };
  onEdit: () => void;
}) {
  const t = useTranslations("cases");
  const { pending, run } = useRun();
  return (
    <RowMenu
      label={t("actionsFor", { key: item.key })}
      archived={item.archived}
      place={place}
      pending={pending}
      onEdit={onEdit}
      onMove={(d) => run(() => moveCaseAction(item.key, d))}
      onArchive={(a) =>
        run(() => setCaseArchivedAction(item.key, a), t(a ? "archivedKey" : "restoredKey", { key: item.key }))
      }
    />
  );
}
