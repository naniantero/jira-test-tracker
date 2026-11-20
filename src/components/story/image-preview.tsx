"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Timeline thumbnail of an image attachment; click opens the full image in a dialog. */
export function ImagePreview({ src, name }: { src: string; name: string }) {
  const t = useTranslations("attachments");
  return (
    <Dialog>
      <DialogTrigger
        aria-label={t("open", { name })}
        render={
          <button
            type="button"
            className="block overflow-hidden rounded-lg border bg-muted outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated attachment route, not optimisable */}
        <img src={src} alt="" loading="lazy" className="h-20 w-28 object-cover" />
      </DialogTrigger>
      <DialogContent className="flex max-h-11/12 w-auto flex-col sm:max-w-5xl">
        <DialogTitle>
          <span className="block truncate pr-8">{name}</span>
        </DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated attachment route, not optimisable */}
        <img src={src} alt={name} className="mx-auto min-h-0 w-auto max-w-full rounded-md object-contain" />
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-xs text-muted-foreground underline underline-offset-3 hover:text-foreground"
        >
          {t("openOriginal")}
        </a>
      </DialogContent>
    </Dialog>
  );
}
