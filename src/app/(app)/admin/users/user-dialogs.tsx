"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActionForm } from "../use-action-form";
import { createUserAction, deleteUserAction, setPasswordAction, type ActionResult } from "./actions";

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {error}
    </p>
  );
}

export function AddUserDialog() {
  const t = useTranslations("users");
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("tester");
  const { error, setError, pending, onSubmit } = useActionForm(
    createUserAction,
    () => setOpen(false),
    t("userCreated"),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setError(null);
          setRole("tester");
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden />
        {t("add")}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
            <DialogDescription>{t("addDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-username">{t("username")}</Label>
            <Input
              id="new-username"
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-name">{t("name")}</Label>
            <Input id="new-name" name="name" autoComplete="off" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("password")}</Label>
            <Input id="new-password" name="password" type="password" autoComplete="new-password" required />
            <Text variant="caption">{t("passwordHint")}</Text>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-role">{t("role")}</Label>
            <input type="hidden" name="role" value={role} />
            <Select value={role} onValueChange={(v) => setRole(v ?? "tester")}>
              <SelectTrigger id="new-role" className="w-full">
                <SelectValue>{role === "admin" ? t("admin") : t("tester")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tester">{t("tester")}</SelectItem>
                <SelectItem value="admin">{t("admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FormError error={error} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden className="animate-spin" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetPasswordDialog({
  userId,
  username,
  open,
  onOpenChange,
}: {
  userId: string;
  username: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("users");
  const { error, setError, pending, onSubmit } = useActionForm(
    setPasswordAction,
    () => onOpenChange(false),
    t("passwordUpdated"),
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
            <DialogTitle>{t("setPassword")}</DialogTitle>
            <DialogDescription>{t("setPasswordDescription", { username })}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="userId" value={userId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`pw-${userId}`}>{t("newPassword")}</Label>
            <Input id={`pw-${userId}`} name="password" type="password" autoComplete="new-password" required />
            <Text variant="caption">{t("passwordHint")}</Text>
          </div>
          <FormError error={error} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 aria-hidden className="animate-spin" />}
              {t("setPassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  userId,
  username,
  open,
  onOpenChange,
}: {
  userId: string;
  username: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("users");
  const tErrors = useTranslations("errors");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    const fd = new FormData();
    fd.set("userId", userId);
    setError(null);
    start(async () => {
      let res: ActionResult;
      try {
        res = await deleteUserAction(fd);
      } catch {
        res = { ok: false, error: tErrors("generic") };
      }
      if (res.ok) {
        toast.success(t("deleted", { username }));
        onOpenChange(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { username })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault(); // stay open until the action finishes
              confirm();
            }}
          >
            {pending && <Loader2 aria-hidden className="animate-spin" />}
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function UserRowActions({ userId, username, isSelf }: { userId: string; username: string; isSelf: boolean }) {
  const t = useTranslations("users");
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={t("actionsFor", { username })} />}
        >
          <MoreHorizontal aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPwOpen(true)}>{t("setPassword")}</DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem variant="destructive" onClick={() => setDelOpen(true)}>
              {t("delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <SetPasswordDialog userId={userId} username={username} open={pwOpen} onOpenChange={setPwOpen} />
      {!isSelf && <DeleteUserDialog userId={userId} username={username} open={delOpen} onOpenChange={setDelOpen} />}
    </>
  );
}
