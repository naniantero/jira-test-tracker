/**
 * Where attachments live, from `ATTACHMENTS_BUCKET_URL`:
 *
 * - `https://<account>.blob.core.windows.net/<container>[/<prefix>]`: Azure Blob Storage
 * - `s3://<bucket>[/<prefix>][?endpoint=<url>&region=<region>]`: S3 or an S3-compatible store (MinIO, R2, …);
 *   with `endpoint` the requests go there, path-style
 */
export type BucketLocation =
  | { kind: "azure"; accountUrl: string; container: string; prefix: string }
  | { kind: "s3"; bucket: string; prefix: string; endpoint: string | undefined; region: string | undefined };

const AZURE_HOST = /^[a-z0-9]+\.blob\.core\.[a-z0-9.]+$/;

/** `a/b/` → `a/b/`, `a/b` → `a/b/`, `` → ``: object keys are `${prefix}${storageName}`. */
function toPrefix(segments: string[]): string {
  const path = segments.filter(Boolean).join("/");
  return path ? `${path}/` : "";
}

/** Throws with a message that never echoes the URL, which could carry a SAS token or keys. */
export function parseBucketUrl(raw: string): BucketLocation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ATTACHMENTS_BUCKET_URL is not a valid URL");
  }
  if (url.username || url.password) throw new Error("ATTACHMENTS_BUCKET_URL must not contain credentials");

  if (url.protocol === "s3:") {
    if (!url.hostname) throw new Error("ATTACHMENTS_BUCKET_URL must name the bucket: s3://<bucket>");
    const endpoint = url.searchParams.get("endpoint") ?? undefined;
    if (endpoint !== undefined && !/^https?:\/\//.test(endpoint)) {
      throw new Error("The endpoint in ATTACHMENTS_BUCKET_URL must be an http(s) URL");
    }
    return {
      kind: "s3",
      bucket: url.hostname,
      prefix: toPrefix(url.pathname.split("/")),
      endpoint,
      region: url.searchParams.get("region") ?? undefined,
    };
  }

  if (url.protocol === "https:" && AZURE_HOST.test(url.hostname)) {
    if (url.search)
      throw new Error("ATTACHMENTS_BUCKET_URL must not contain a query: use workload identity, not a SAS token");
    const [container, ...rest] = url.pathname.split("/").filter(Boolean);
    if (!container) {
      throw new Error(
        "ATTACHMENTS_BUCKET_URL must name the container: https://<account>.blob.core.windows.net/<container>",
      );
    }
    return { kind: "azure", accountUrl: url.origin, container, prefix: toPrefix(rest) };
  }

  throw new Error(
    "ATTACHMENTS_BUCKET_URL must be https://<account>.blob.core.windows.net/<container> or s3://<bucket>",
  );
}
