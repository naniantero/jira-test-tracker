import { getTranslations } from "next-intl/server";
import type { Failure } from "@/lib/errors";

/** Server actions: the failure as the text the page shows. */
export async function translateFailure(f: Failure): Promise<{ ok: false; error: string }> {
  const t = await getTranslations("errors");
  return { ok: false, error: t(f.error, f.values) };
}
