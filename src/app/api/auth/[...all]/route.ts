import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth";

// Resolve the auth instance per request (not at import) so `next build` needs no secrets.
export const { GET, POST } = toNextJsHandler(async (request: Request) => (await getAuth()).handler(request));
