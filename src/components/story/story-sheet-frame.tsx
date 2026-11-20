"use client";

import { createContext, startTransition, use, useOptimistic, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StorySheetSkeleton } from "./story-sheet-skeleton";

type StorySheetControls = {
  /** The story whose sheet is open, or about to be while its navigation is pending. */
  openKey: string | null;
  open(storyKey: string, href: string): void;
};

const StorySheetContext = createContext<StorySheetControls | null>(null);

export function useStorySheet(): StorySheetControls {
  const controls = use(StorySheetContext);
  if (!controls) throw new Error("useStorySheet must be used inside StorySheetProvider");
  return controls;
}

/**
 * The right-hand sheet around server-rendered story content (`sheet`, streamed for `storyKey`). It is open
 * while `?story=` is in the URL, and opens at once on `open()`: the story is set optimistically and shows a
 * skeleton until the navigation brings its content. Closing animates out with the last content and
 * navigates to `closeHref` (same view without the param).
 */
export function StorySheetProvider({
  storyKey,
  closeHref,
  sheet,
  children,
}: {
  storyKey: string | null;
  closeHref: string;
  sheet: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [openKey, setOpenKey] = useOptimistic(storyKey);
  // The content stays while the sheet animates out, after the navigation has already dropped it.
  const [shown, setShown] = useState({ key: storyKey, sheet });
  if (storyKey !== null && (shown.key !== storyKey || shown.sheet !== sheet)) setShown({ key: storyKey, sheet });
  // Focus the panel itself on open, not its first link, so no stray focus ring lands on the reference link.
  const popupRef = useRef<HTMLDivElement>(null);

  function navigate(key: string | null, href: string) {
    startTransition(() => {
      setOpenKey(key);
      if (key === null) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  const controls: StorySheetControls = { openKey, open: navigate };
  return (
    <StorySheetContext value={controls}>
      {children}
      <Sheet
        open={openKey !== null}
        onOpenChange={(next) => {
          if (!next) navigate(null, closeHref);
        }}
      >
        <SheetContent
          ref={popupRef}
          initialFocus={popupRef}
          side="right"
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        >
          {openKey !== null && openKey !== shown.key ? <StorySheetSkeleton /> : shown.sheet}
        </SheetContent>
      </Sheet>
    </StorySheetContext>
  );
}
