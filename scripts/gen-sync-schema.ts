/**
 * Writes `schema/sync.schema.json`, the JSON Schema of the sync file, from the zod schema the CLI validates with.
 * Run with `npm run schema:generate` after changing `src/lib/cases/schema.ts`; a test fails if the file is stale.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import { z } from "zod";
import { criteriaSchema, MAX_CRITERIA, MAX_CRITERION_LENGTH, syncFileSchema } from "../src/lib/cases/schema";

export const SCHEMA_PATH = join(import.meta.dirname, "../schema/sync.schema.json");

/** The schema as the repo's Prettier setup formats JSON, so `npm run format:check` accepts the file. */
export async function renderSyncSchema(): Promise<string> {
  const schema = z.toJSONSchema(syncFileSchema, {
    io: "input",
    // The criteria limits apply after blank lines are dropped, so the input side carries none of its own.
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema !== criteriaSchema) return;
      jsonSchema.maxItems = MAX_CRITERIA;
      jsonSchema.items = { type: "string", maxLength: MAX_CRITERION_LENGTH };
    },
  });
  const json = JSON.stringify(schema, null, 2);
  const config = await resolveConfig(SCHEMA_PATH);
  return format(json, { ...config, filepath: SCHEMA_PATH });
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  renderSyncSchema()
    .then((text) => writeFileSync(SCHEMA_PATH, text))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
