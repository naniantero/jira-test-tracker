"use client";

import { useOptimistic, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { dismissContentChangeAction, submitStoryEvent } from "@/app/(app)/story-actions";
import { Button } from "@/components/ui/button";
import type { StoryStatus } from "@/lib/stories/status";

/**
 * Admin-only buttons in the "Changed since tested" alert. Rendered only for admins, so testers never
 * receive these props. **Send to retest** is hidden when the story already awaits a retest.
 */
export function ContentChangeActions({
  storyKey,
  status,
  contentVersion,
}: {
  storyKey: string;
  status: StoryStatus;
  contentVersion: number;
}) {
  const t = useTranslations("changed");
  const tStory = useTranslations("story");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useOptimistic<"retest" | "keep" | null>(null);

  function run(kind: "retest" | "keep") {
    const formData = new FormData();
    formData.set("storyKey", storyKey);
    if (kind === "retest") {
      formData.set("expectedStatus", status);
      formData.set("contentVersion", String(contentVersion));
      formData.set("toStatus", "retest");
      formData.set("comment", t("comment"));
    }
    startTransition(async () => {
      setBusy(kind);
      try {
        const result =
          kind === "retest" ? await submitStoryEvent(formData) : await dismissContentChangeAction(formData);
        if (!result.ok) {
          toast.error(result.error);
          // Pull in the latest text and status, so the next click is made against them.
          router.refresh();
        }
      } catch {
        toast.error(tStory("saveFailed"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "retest" && (
        <Button type="button" size="sm" disabled={pending} onClick={() => run("retest")}>
          {busy === "retest" && <Loader2 aria-hidden className="animate-spin" />}
          {t("sendToRetest")}
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run("keep")}>
        {busy === "keep" && <Loader2 aria-hidden className="animate-spin" />}
        {t("keepStatus")}
      </Button>
    </div>
  );
}
