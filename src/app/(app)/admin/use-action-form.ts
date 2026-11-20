import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Runs a Server Action from a form; closes via onDone on success, shows the error inline otherwise. */
export function useActionForm(action: (fd: FormData) => Promise<ActionResult>, onDone: () => void, success: string) {
  const tErrors = useTranslations("errors");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      let res: ActionResult;
      try {
        res = await action(fd);
      } catch {
        res = { ok: false, error: tErrors("generic") };
      }
      if (res.ok) {
        toast.success(success);
        onDone();
      } else {
        setError(res.error);
      }
    });
  }
  return { error, setError, pending, onSubmit };
}
