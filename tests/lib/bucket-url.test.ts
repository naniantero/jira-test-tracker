import { describe, expect, it } from "vitest";
import { parseBucketUrl } from "@/lib/attachments/bucket-url";

describe("parseBucketUrl", () => {
  it("reads an S3 bucket with and without a prefix", () => {
    expect(parseBucketUrl("s3://tracker")).toEqual({
      kind: "s3",
      bucket: "tracker",
      prefix: "",
      endpoint: undefined,
      region: undefined,
    });
    expect(parseBucketUrl("s3://tracker/prod/attachments/")).toMatchObject({ prefix: "prod/attachments/" });
    expect(parseBucketUrl("s3://tracker/prod")).toMatchObject({ prefix: "prod/" });
  });

  it("reads the endpoint and region of an S3-compatible store", () => {
    expect(
      parseBucketUrl(`s3://tracker?endpoint=${encodeURIComponent("http://127.0.0.1:9000")}&region=us-east-1`),
    ).toMatchObject({ endpoint: "http://127.0.0.1:9000", region: "us-east-1" });
    expect(() => parseBucketUrl("s3://tracker?endpoint=minio:9000")).toThrow("must be an http(s) URL");
  });

  it("reads an Azure Blob container with and without a prefix", () => {
    expect(parseBucketUrl("https://acct.blob.core.windows.net/attachments")).toEqual({
      kind: "azure",
      accountUrl: "https://acct.blob.core.windows.net",
      container: "attachments",
      prefix: "",
    });
    expect(parseBucketUrl("https://acct.blob.core.windows.net/attachments/prod")).toMatchObject({
      container: "attachments",
      prefix: "prod/",
    });
  });

  it("rejects an Azure URL without a container or with a SAS token", () => {
    expect(() => parseBucketUrl("https://acct.blob.core.windows.net/")).toThrow("must name the container");
    expect(() => parseBucketUrl("https://acct.blob.core.windows.net/c?sv=2024&sig=secret")).toThrow("SAS token");
  });

  it("rejects credentials, other schemes and other hosts without echoing the URL", () => {
    for (const url of ["s3://key:secret@tracker", "ftp://tracker", "https://example.com/c", "not a url"]) {
      expect(() => parseBucketUrl(url)).toThrow(/ATTACHMENTS_BUCKET_URL/);
      try {
        parseBucketUrl(url);
      } catch (err) {
        expect((err as Error).message).not.toContain("secret");
      }
    }
  });
});
