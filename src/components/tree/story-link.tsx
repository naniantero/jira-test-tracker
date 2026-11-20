"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStorySheet } from "@/components/story/story-sheet-frame";

/** Opens the story's sheet at once, without waiting for the navigation to `href`; marks the open story's row. */
export function StoryLink({
  storyKey,
  href,
  className,
  children,
}: {
  storyKey: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const sheet = useStorySheet();
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={sheet.openKey === storyKey ? "true" : undefined}
      onNavigate={(e) => {
        e.preventDefault();
        sheet.open(storyKey, href);
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
