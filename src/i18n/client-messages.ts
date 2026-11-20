import type { Messages } from "next-intl";

/** Namespaces only admins' pages use; testers' pages never carry them to the browser. */
const ADMIN_ONLY = ["adminNav", "cases", "changed", "users"] as const satisfies readonly (keyof Messages)[];

export type PublicMessages = Omit<Messages, (typeof ADMIN_ONLY)[number]>;

/** The messages every page sends to client components. */
export function publicMessages(messages: Messages): PublicMessages {
  const copy: Partial<Messages> = { ...messages };
  for (const ns of ADMIN_ONLY) delete copy[ns];
  return copy as PublicMessages;
}
