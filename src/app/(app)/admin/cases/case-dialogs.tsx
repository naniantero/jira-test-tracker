"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import type { CaseDetail, GroupDetail, GroupSummary } from "@/lib/cases";
import { useActionForm } from "../use-action-form";
import { createCaseAction, createGroupAction, updateCaseAction, updateGroupAction } from "./actions";

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Text variant="error" role="alert">
      {error}
    </Text>
  );
}

/** Edit dialogs: opens at once and loads the current content, so it is never stale; closes with a toast if gone. */
export function useEditDialog<T>(load: (key: string) => Promise<T | null>, notFound: string) {
  const tErrors = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<T | null>(null);
  const [, start] = useTransition();
  const requested = useRef(0);
  function openFor(key: string) {
    const request = ++requested.current;
    setDetail(null);
    setOpen(true);
    start(async () => {
      let d: T | null;
      try {
        d = await load(key);
      } catch {
        if (request !== requested.current) return;
        setOpen(false);
        toast.error(tErrors("generic"));
        return;
      }
      if (request !== requested.current) return;
      if (d) setDetail(d);
      else {
        setOpen(false);
        toast.error(notFound);
      }
    });
  }
  function onOpenChange(o: boolean) {
    if (!o) requested.current++;
    setOpen(o);
  }
  return { open, onOpenChange, detail, openFor };
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <Text variant="caption">{hint}</Text>}
    </div>
  );
}

function Footer({ pending, submit }: { pending: boolean; submit: string }) {
  const t = useTranslations("cases");
  return (
    <DialogFooter>
      <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 aria-hidden className="animate-spin" />}
        {submit}
      </Button>
    </DialogFooter>
  );
}

function Loading() {
  const t = useTranslations("cases");
  return (
    <div role="status" className="flex items-center gap-2">
      <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
      <Text variant="muted">{t("loading")}</Text>
    </div>
  );
}

function GroupFields({ group }: { group?: GroupDetail }) {
  const t = useTranslations("cases");
  return (
    <>
      {group ? (
        <input type="hidden" name="key" value={group.key} />
      ) : (
        <Field id="group-key" label={t("key")} hint={t("keyHint")}>
          <Input id="group-key" name="key" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </Field>
      )}
      <Field id="group-title" label={t("name")}>
        <Input id="group-title" name="title" autoComplete="off" defaultValue={group?.title} required />
      </Field>
      <Field id="group-description" label={t("description")} hint={t("descriptionHint")}>
        <Textarea
          id="group-description"
          name="description"
          rows={4}
          className="max-h-64"
          defaultValue={group?.description ?? ""}
        />
      </Field>
    </>
  );
}

/** "New group" button and its dialog. */
export function GroupDialog() {
  const t = useTranslations("cases");
  const [open, setOpen] = useState(false);
  const { error, setError, pending, onSubmit } = useActionForm(
    createGroupAction,
    () => setOpen(false),
    t("groupCreated"),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden />
        {t("newGroup")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("newGroup")}</DialogTitle>
            <DialogDescription>{t("newGroupDescription")}</DialogDescription>
          </DialogHeader>
          <GroupFields />
          <FormError error={error} />
          <Footer pending={pending} submit={t("create")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditGroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group: GroupDetail | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("cases");
  const { error, setError, pending, onSubmit } = useActionForm(
    updateGroupAction,
    () => onOpenChange(false),
    t("saved"),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("editGroup")}</DialogTitle>
            {group && <DialogDescription>{group.key}</DialogDescription>}
          </DialogHeader>
          {group ? <GroupFields key={group.key} group={group} /> : <Loading />}
          <FormError error={error} />
          <Footer pending={pending || !group} submit={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CaseFields({ value, groups }: { value?: CaseDetail; groups?: GroupSummary[] }) {
  const t = useTranslations("cases");
  const [groupKey, setGroupKey] = useState(value?.groupKey ?? "");
  const groupTitle = (key: string) => groups?.find((g) => g.key === key)?.title ?? key;
  return (
    <>
      {value ? (
        <input type="hidden" name="key" value={value.key} />
      ) : (
        <Field id="case-key" label={t("key")} hint={t("keyHint")}>
          <Input id="case-key" name="key" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
        </Field>
      )}
      <Field id="case-title" label={t("name")}>
        <Input id="case-title" name="title" autoComplete="off" defaultValue={value?.title} required />
      </Field>
      <Field id="case-description" label={t("description")} hint={t("descriptionHint")}>
        <Textarea
          id="case-description"
          name="description"
          rows={6}
          className="max-h-72"
          defaultValue={value?.description}
        />
      </Field>
      <Field id="case-criteria" label={t("criteria")} hint={t("criteriaHint")}>
        <Textarea
          id="case-criteria"
          name="criteria"
          rows={4}
          className="max-h-72"
          defaultValue={value?.acceptanceCriteria.join("\n")}
        />
      </Field>
      <Field id="case-reference" label={t("reference")} hint={t("referenceHint")}>
        <Input id="case-reference" name="reference" autoComplete="off" defaultValue={value?.reference ?? ""} />
      </Field>
      {value && groups && (
        <Field id="case-group" label={t("group")}>
          <input type="hidden" name="groupKey" value={groupKey} />
          <Select value={groupKey} onValueChange={(v) => setGroupKey(v ?? value.groupKey)}>
            <SelectTrigger id="case-group" className="w-full">
              <SelectValue>{groupTitle(groupKey)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}

/** Per-group "New test case" button and its dialog. */
export function NewCaseDialog({ group }: { group: GroupSummary }) {
  const t = useTranslations("cases");
  const [open, setOpen] = useState(false);
  const { error, setError, pending, onSubmit } = useActionForm(
    createCaseAction,
    () => setOpen(false),
    t("caseCreated"),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus aria-hidden />
        {t("newCase")}
      </DialogTrigger>
      <DialogContent className="max-h-11/12 overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("newCase")}</DialogTitle>
            <DialogDescription>{t("newCaseDescription", { group: group.title })}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="groupKey" value={group.key} />
          <CaseFields />
          <FormError error={error} />
          <Footer pending={pending} submit={t("create")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** `groups` are the move targets: the active groups and the case's own. */
export function EditCaseDialog({
  value,
  groups,
  open,
  onOpenChange,
}: {
  value: CaseDetail | null;
  groups: GroupSummary[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("cases");
  const { error, setError, pending, onSubmit } = useActionForm(updateCaseAction, () => onOpenChange(false), t("saved"));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-11/12 overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("editCase")}</DialogTitle>
            <DialogDescription>{t("editCaseDescription")}</DialogDescription>
          </DialogHeader>
          {value ? (
            <CaseFields
              key={value.key}
              value={value}
              groups={groups.filter((g) => !g.archived || g.key === value.groupKey)}
            />
          ) : (
            <Loading />
          )}
          <FormError error={error} />
          <Footer pending={pending || !value} submit={t("save")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
