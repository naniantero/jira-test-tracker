import { describe, it, expect, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestDb } from "../helpers/test-db";
import { detectAllowedType } from "@/lib/attachments/detect";
import { MAX_ATTACHMENT_BYTES, validateAndStoreFiles, removeStoredFiles } from "@/lib/attachments/storage";
import { getAttachment, buildAttachmentResponse } from "@/lib/attachments/repository";
import type { AttachmentStore } from "@/lib/attachments/bucket";

const fx = (n: string) => readFile(join(__dirname, "../fixtures/files", n));

/** An in-memory bucket: object names to their content type. */
function memoryStore(): AttachmentStore & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async put(name, _bytes, contentType) {
      objects.set(name, contentType);
    },
    async get() {
      return null;
    },
    async remove(name) {
      objects.delete(name);
    },
  };
}

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  store = memoryStore();
});

describe("detectAllowedType", () => {
  it("accepts png, pdf, txt", async () => {
    expect((await detectAllowedType(await fx("pixel.png"), "a.png"))?.mimeType).toBe("image/png");
    expect((await detectAllowedType(await fx("doc.pdf"), "a.pdf"))?.mimeType).toBe("application/pdf");
    const t = await detectAllowedType(await fx("notes.txt"), "notes.txt");
    expect(t).toEqual({ mimeType: "text/plain", ext: "txt", kind: "text" });
  });
  it("rejects html disguised as png", async () => {
    expect(await detectAllowedType(await fx("evil.html"), "evil.png")).toBeNull();
    expect(await detectAllowedType(await fx("evil.html"), "evil.html")).toBeNull();
  });
  it("rejects svg", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(await detectAllowedType(svg, "a.svg")).toBeNull();
    expect(await detectAllowedType(svg, "a.png")).toBeNull();
  });
  it("rejects .txt containing NUL", async () => {
    expect(await detectAllowedType(new Uint8Array([65, 0, 66]), "a.txt")).toBeNull();
  });
  it("rejects invalid utf-8 text", async () => {
    expect(await detectAllowedType(new Uint8Array([0xff, 0xfe, 0x41]), "a.log")).toBeNull();
  });
});

describe("validateAndStoreFiles", () => {
  it("stores with random name", async () => {
    const bytes = await fx("pixel.png");
    const r = await validateAndStoreFiles(store, [{ name: "shot.png", bytes }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stored[0].storageName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(r.stored[0]).toMatchObject({ originalName: "shot.png", mimeType: "image/png", sizeBytes: bytes.length });
    expect([...store.objects]).toEqual([[r.stored[0].storageName, "image/png"]]);
    await removeStoredFiles(store, [r.stored[0].storageName]);
    expect(store.objects.size).toBe(0);
  });
  it("forces the detected extension onto the stored name", async () => {
    const pdf = await fx("doc.pdf");
    const png = await fx("pixel.png");
    const log = await fx("notes.txt");
    const r = await validateAndStoreFiles(store, [
      { name: "x.html", bytes: pdf },
      { name: "x.txt", bytes: png },
      { name: "noext", bytes: png },
      { name: "notes.log", bytes: log },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stored.map((s) => [s.originalName, s.mimeType])).toEqual([
      ["x.pdf", "application/pdf"],
      ["x.png", "image/png"],
      ["noext.png", "image/png"],
      ["notes.log", "text/plain"],
    ]);
  });
  it("rejects 6 files", async () => {
    const bytes = await fx("pixel.png");
    const r = await validateAndStoreFiles(
      store,
      Array.from({ length: 6 }, () => ({ name: "a.png", bytes })),
    );
    expect(r).toEqual({ ok: false, error: "tooManyFiles", values: { max: 5 } });
    expect(store.objects.size).toBe(0);
  });
  it("rejects file over 10 MB", async () => {
    const big = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
    const r = await validateAndStoreFiles(store, [{ name: "big.png", bytes: big }]);
    expect(r).toEqual({ ok: false, error: "fileTooLarge", values: { name: "big.png" } });
    expect(store.objects.size).toBe(0);
  });
  it("removes the files already stored when a later upload fails", async () => {
    const png = await fx("pixel.png");
    const put = store.put;
    store.put = async (name, bytes, contentType) => {
      if (store.objects.size === 1) throw new Error("bucket down");
      await put(name, bytes, contentType);
    };
    await expect(
      validateAndStoreFiles(store, [
        { name: "a.png", bytes: png },
        { name: "b.png", bytes: png },
      ]),
    ).rejects.toThrow("bucket down");
    expect(store.objects.size).toBe(0);
  });
  it("rejects disallowed type and writes nothing", async () => {
    const png = await fx("pixel.png");
    const r = await validateAndStoreFiles(store, [
      { name: "ok.png", bytes: png },
      { name: "evil.png", bytes: await fx("evil.html") },
    ]);
    expect(r).toEqual({ ok: false, error: "fileTypeNotAllowed", values: { name: "evil.png" } });
    expect(store.objects.size).toBe(0);
  });
});

describe("serving", () => {
  async function seed(mimeType: string, originalName: string) {
    const db = await createTestDb();
    const { epics, stories, storyEvents, attachments } = db.t;
    const [e] = await db.orm.insert(epics).values({ key: "E1", title: "E1", position: 0 }).returning();
    const [s] = await db.orm.insert(stories).values({ key: "S1", epicId: e.id, title: "S1", position: 0 }).returning();
    const [ev] = await db.orm.insert(storyEvents).values({ storyId: s.id, actorName: "A" }).returning();
    await db.orm
      .insert(attachments)
      .values({ id: "att-1", eventId: ev.id, originalName, mimeType, sizeBytes: 3, storageName: "x.bin" });
    return db;
  }
  it("getAttachment returns null for unknown id", async () => {
    expect(await getAttachment(await seed("image/png", "a.png"), "nope")).toBeNull();
  });
  it("serves image inline", async () => {
    const row = (await getAttachment(await seed("image/png", "a.png"), "att-1"))!;
    const res = buildAttachmentResponse(row, new Uint8Array([1]));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe("inline");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });
  it("serves non-images as attachment with nosniff", async () => {
    const row = (await getAttachment(await seed("text/plain", "näme €.txt"), "att-1"))!;
    const res = buildAttachmentResponse(row, new Uint8Array([1]));
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''n%C3%A4me%20%E2%82%AC.txt");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  });
});
