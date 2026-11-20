import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Text } from "@/components/ui/text";

/** A story's reference: a link when it is an http(s) URL, code text otherwise. */
export function StoryReference({ reference }: { reference: string }) {
  const t = useTranslations("story");
  const url = httpUrl(reference);
  if (!url) {
    return (
      <Text variant="code" render={<span />} title={t("reference")}>
        {reference}
      </Text>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={reference}
      className="inline-flex items-center gap-1 rounded font-medium text-link underline-offset-3 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t("reference")}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

function httpUrl(reference: string): string | null {
  try {
    const url = new URL(reference);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
