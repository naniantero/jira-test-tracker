import { getDb, pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pingDb(await getDb());
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
