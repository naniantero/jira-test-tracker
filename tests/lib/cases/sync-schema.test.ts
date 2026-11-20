import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSyncSchema, SCHEMA_PATH } from "../../../scripts/gen-sync-schema";
import { parseSyncFile } from "@/lib/cases/schema";

const ROOT = join(import.meta.dirname, "../../..");

describe("sync file artefacts", () => {
  it("commits the JSON Schema that the generator produces", async () => {
    expect(readFileSync(SCHEMA_PATH, "utf8")).toBe(await renderSyncSchema());
  });

  it("describes the file format", async () => {
    const schema = JSON.parse(await renderSyncSchema());
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["schemaVersion", "group", "cases"]));
  });

  it("carries the text and criteria limits", async () => {
    const { properties: c } = JSON.parse(await renderSyncSchema()).properties.cases.items;
    expect(c.title).toMatchObject({ minLength: 1, maxLength: 500 });
    expect(c.description).toMatchObject({ maxLength: 50_000 });
    expect(c.reference).toMatchObject({ maxLength: 500 });
    expect(c.acceptanceCriteria).toMatchObject({ maxItems: 100, items: { type: "string", maxLength: 5_000 } });
  });

  it("ships an example that passes validation", () => {
    const example: unknown = JSON.parse(readFileSync(join(ROOT, "examples/sync.example.json"), "utf8"));
    const parsed = parseSyncFile(example);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.file.group.key).toBe("login");
  });
});
