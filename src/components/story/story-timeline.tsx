import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status/status-badge";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { TimelineEvent } from "@/lib/stories/queries";
import { ImagePreview } from "./image-preview";
import { Markdown } from "./markdown";

const attachmentUrl = (id: string) => `/api/attachments/${encodeURIComponent(id)}`;

/** Story history, newest first: who, when, status change, comment and attachments. */
export function StoryTimeline({ events, showAttachments }: { events: TimelineEvent[]; showAttachments: boolean }) {
  const t = useTranslations("timeline");
  return (
    <section aria-labelledby="story-activity" className="space-y-3">
      <Heading id="story-activity">{t("heading")}</Heading>
      {events.length === 0 ? (
        <Text variant="muted">{t("empty")}</Text>
      ) : (
        <ol className="space-y-5 border-l pl-4">
          {events.map((e) => {
            const files = showAttachments ? e.attachments : [];
            const images = files.filter((a) => a.mimeType.startsWith("image/"));
            const others = files.filter((a) => !a.mimeType.startsWith("image/"));
            return (
              <li key={e.id} className="relative space-y-2">
                <span aria-hidden className="absolute top-1.5 -left-5 size-2 rounded-full bg-border" />
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{e.actorName}</span>
                  <Text variant="caption" render={<time dateTime={e.createdAt.toISOString()} />}>
                    {formatDateTime(e.createdAt)}
                  </Text>
                </p>
                {e.toStatus && (
                  <p className="flex flex-wrap items-center gap-1.5">
                    {e.fromStatus && (
                      <>
                        <StatusBadge status={e.fromStatus} />
                        <span className="text-muted-foreground">→</span>
                      </>
                    )}
                    <StatusBadge status={e.toStatus} />
                  </p>
                )}
                {e.comment && <Markdown source={e.comment} />}
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {images.map((a) => (
                      <ImagePreview key={a.id} src={attachmentUrl(a.id)} name={a.originalName} />
                    ))}
                  </div>
                )}
                {others.length > 0 && (
                  <ul className="space-y-1">
                    {others.map((a) => (
                      <li key={a.id}>
                        <a
                          href={attachmentUrl(a.id)}
                          download={a.originalName}
                          className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-link underline-offset-3 hover:underline"
                        >
                          <Download aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{a.originalName}</span>
                          <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
                            {formatBytes(a.sizeBytes)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
