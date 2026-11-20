import { eq } from "drizzle-orm";
import type { AppDb, Tables } from "@/lib/db";

export type AttachmentRow = Tables["attachments"]["$inferSelect"];

export async function getAttachment(db: AppDb, id: string): Promise<AttachmentRow | null> {
  const [row] = await db.orm.select().from(db.t.attachments).where(eq(db.t.attachments.id, id)).limit(1);
  return row ?? null;
}

function encodeRfc5987(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function buildAttachmentResponse(row: AttachmentRow, body: BodyInit): Response {
  const contentType = row.mimeType === "text/plain" ? "text/plain; charset=utf-8" : row.mimeType;
  const disposition = row.mimeType.startsWith("image/")
    ? "inline"
    : `attachment; filename*=UTF-8''${encodeRfc5987(row.originalName)}`;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": disposition,
    },
  });
}
