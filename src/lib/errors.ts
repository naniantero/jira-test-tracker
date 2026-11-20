import type messages from "@/i18n/messages/en.json";

/** A user-facing error as a message key under `errors`, with the values its message needs. */
export type ErrorKey = keyof (typeof messages)["errors"];
export type Failure = { ok: false; error: ErrorKey; values?: Record<string, string | number> };
