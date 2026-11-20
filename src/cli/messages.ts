import messages from "@/i18n/messages/en.json";
import type { Failure } from "@/lib/errors";

/** The English text of a library failure, `{name}` placeholders filled from its values. */
export function errorMessage({ error, values }: Pick<Failure, "error" | "values">): string {
  return messages.errors[error].replace(/\{(\w+)\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match,
  );
}
