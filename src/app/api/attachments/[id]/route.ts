import { getAuth } from "@/lib/auth/auth";
import { getDb } from "@/lib/db";
import { getAttachmentStore } from "@/lib/attachments/bucket";
import { buildAttachmentResponse, getAttachment } from "@/lib/attachments/repository";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await (await getAuth()).api.getSession({ headers: req.headers });
  if (!session || session.user.banned) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = getAttachmentStore();
  if (!store) return Response.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const row = await getAttachment(await getDb(), id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  // The object name comes only from the DB storageName, never from the request.
  const body = await store.get(row.storageName);
  if (!body) return Response.json({ error: "Not found" }, { status: 404 });
  const res = buildAttachmentResponse(row, body);
  res.headers.set("Content-Length", String(row.sizeBytes));
  return res;
}
