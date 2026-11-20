const TIME_ZONE = "Europe/Helsinki";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

/** `17 Nov 2026` in Helsinki time, regardless of server or browser time zone. */
export function formatDate(d: Date): string {
  return dateFormat.format(d);
}

/** `17 Nov 2026, 14:05` in Helsinki time. */
export function formatDateTime(d: Date): string {
  return dateTimeFormat.format(d);
}

const sizeFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** `512 B`, `1.5 KB`, `10 MB` (binary units, as the 10 MB attachment limit). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}
