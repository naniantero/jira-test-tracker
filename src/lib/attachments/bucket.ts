import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, isRestError } from "@azure/storage-blob";
import { getEnv } from "@/lib/env";
import { parseBucketUrl, type BucketLocation } from "./bucket-url";

/** Attachment files by storage name; the database holds everything else about them. */
export type AttachmentStore = {
  put(storageName: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** `null` when there is no such object. */
  get(storageName: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Succeeds when the object is already gone. */
  remove(storageName: string): Promise<void>;
};

/** Credentials come from the SDK's default chain: environment, web identity, shared files, instance role. */
function s3Store(location: Extract<BucketLocation, { kind: "s3" }>): AttachmentStore {
  const client = new S3Client({
    region: location.region,
    endpoint: location.endpoint,
    forcePathStyle: location.endpoint !== undefined,
    // S3-compatible stores do not all support the newer default checksums.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const key = (storageName: string) => `${location.prefix}${storageName}`;
  return {
    async put(storageName, bytes, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: location.bucket, Key: key(storageName), Body: bytes, ContentType: contentType }),
      );
    },
    async get(storageName) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: location.bucket, Key: key(storageName) }));
        return res.Body ? (res.Body.transformToWebStream() as ReadableStream<Uint8Array>) : null;
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async remove(storageName) {
      await client.send(new DeleteObjectCommand({ Bucket: location.bucket, Key: key(storageName) }));
    },
  };
}

/** Credentials come from `DefaultAzureCredential`: workload identity on AKS, managed identity, `az login`. */
function azureStore(location: Extract<BucketLocation, { kind: "azure" }>): AttachmentStore {
  const container = new BlobServiceClient(location.accountUrl, new DefaultAzureCredential()).getContainerClient(
    location.container,
  );
  const blob = (storageName: string) => container.getBlockBlobClient(`${location.prefix}${storageName}`);
  return {
    async put(storageName, bytes, contentType) {
      await blob(storageName).uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    async get(storageName) {
      try {
        const body = (await blob(storageName).download()).readableStreamBody;
        return body ? (Readable.toWeb(Readable.from(body)) as ReadableStream<Uint8Array>) : null;
      } catch (err) {
        if (isRestError(err) && err.statusCode === 404) return null;
        throw err;
      }
    },
    async remove(storageName) {
      await blob(storageName).deleteIfExists();
    },
  };
}

export function createAttachmentStore(location: BucketLocation): AttachmentStore {
  switch (location.kind) {
    case "s3":
      return s3Store(location);
    case "azure":
      return azureStore(location);
    default: {
      const unhandled: never = location;
      throw new Error(`Unknown bucket kind: ${JSON.stringify(unhandled)}`);
    }
  }
}

let cached: AttachmentStore | null | undefined;

/** The configured store, or `null` when `ATTACHMENTS_BUCKET_URL` is unset: attachments are then disabled. */
export function getAttachmentStore(): AttachmentStore | null {
  if (cached === undefined) {
    const url = getEnv().ATTACHMENTS_BUCKET_URL;
    cached = url ? createAttachmentStore(parseBucketUrl(url)) : null;
  }
  return cached;
}
