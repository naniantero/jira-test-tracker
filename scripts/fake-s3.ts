/**
 * An in-memory S3 for the e2e suite (`playwright.config.ts`), path-style, serving only what the app calls:
 *
 * - `PUT    /<bucket>/<key>` stores the body and its `Content-Type`
 * - `GET    /<bucket>/<key>` returns them, or 404 `NoSuchKey`
 * - `DELETE /<bucket>/<key>` → 204, also when the object does not exist
 * - `GET    /_health` → 200 without auth, for Playwright's readiness check
 *
 * Signatures are not verified, but every request must be signed with `AWS_ACCESS_KEY_ID` from this process's
 * env, so a client that lost its credentials fails here too.
 *
 * Usage: `tsx scripts/fake-s3.ts`, port from `FAKE_S3_PORT` (default 4103). Listens on 127.0.0.1 only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const HOST = "127.0.0.1";
const port = Number(process.env.FAKE_S3_PORT ?? 4103);
const credential = `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID ?? ""}/`;

const objects = new Map<string, { body: Buffer; contentType: string }>();

function error(res: ServerResponse, status: number, code: string): void {
  res.writeHead(status, { "Content-Type": "application/xml" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${code}</Message></Error>`);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.url === "/_health") {
    res.writeHead(200);
    res.end();
    return;
  }
  if (!req.headers.authorization?.startsWith(credential)) return error(res, 403, "InvalidAccessKeyId");
  const path = decodeURIComponent(new URL(req.url ?? "/", `http://${HOST}`).pathname);
  const [, bucket, ...key] = path.split("/");
  if (!bucket || key.length === 0) return error(res, 400, "InvalidRequest");
  const id = `${bucket}/${key.join("/")}`;

  switch (req.method) {
    case "PUT": {
      const body = await readBody(req);
      objects.set(id, { body, contentType: req.headers["content-type"] ?? "application/octet-stream" });
      res.writeHead(200, { ETag: `"${objects.size}"` });
      res.end();
      return;
    }
    case "GET": {
      const object = objects.get(id);
      if (!object) return error(res, 404, "NoSuchKey");
      res.writeHead(200, { "Content-Type": object.contentType, "Content-Length": object.body.length });
      res.end(object.body);
      return;
    }
    case "DELETE":
      objects.delete(id);
      res.writeHead(204);
      res.end();
      return;
    default:
      return error(res, 405, "MethodNotAllowed");
  }
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    console.error(err);
    if (!res.headersSent) error(res, 500, "InternalError");
  });
}).listen(port, HOST, () => console.log(`fake S3 on http://${HOST}:${port}`));
