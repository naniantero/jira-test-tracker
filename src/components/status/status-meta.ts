import { Circle, CircleCheck, RotateCw, TriangleAlert, type LucideIcon } from "lucide-react";
import type { StoryStatus } from "@/lib/stories/status";

/** Labels are messages under `status`, keyed by the status. */
export type StatusMeta = {
  icon: LucideIcon;
  /** Status colour as text/icon colour. */
  textClass: string;
  /** Strong fill, e.g. progress bar segments. */
  solidClass: string;
  /** Pale fill for badges and highlighted rows. */
  softClass: string;
};

// Full class names are spelled out so Tailwind's scanner picks them up.
export const STATUS_META: Record<StoryStatus, StatusMeta> = {
  untested: {
    icon: Circle,
    textClass: "text-status-untested",
    solidClass: "bg-status-untested",
    softClass: "bg-status-untested-soft",
  },
  passed: {
    icon: CircleCheck,
    textClass: "text-status-passed",
    solidClass: "bg-status-passed",
    softClass: "bg-status-passed-soft",
  },
  failed: {
    icon: TriangleAlert,
    textClass: "text-status-failed",
    solidClass: "bg-status-failed",
    softClass: "bg-status-failed-soft",
  },
  retest: {
    icon: RotateCw,
    textClass: "text-status-retest",
    solidClass: "bg-status-retest",
    softClass: "bg-status-retest-soft",
  },
};
