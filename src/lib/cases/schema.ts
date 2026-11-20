import { z } from "zod";

export const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const key = z.string().regex(KEY_RE, "Invalid key");
// Browsers submit textarea line breaks as CRLF; stored text uses LF so an unchanged edit compares equal.
const lf = (s: string) => s.replace(/\r\n?/g, "\n");
const title = z.string().overwrite(lf).trim().min(1).max(500);
const description = z.string().overwrite(lf).max(50_000);
export const MAX_CRITERIA = 100;
export const MAX_CRITERION_LENGTH = 5_000;
// Blank lines are dropped before the count is checked.
export const criteriaSchema = z
  .array(z.string())
  .transform((list) => list.map((c) => lf(c).trim()).filter((c) => c !== ""))
  .pipe(z.array(z.string().max(MAX_CRITERION_LENGTH)).max(MAX_CRITERIA));
const reference = z.string().trim().max(500);

export const groupInputSchema = z.object({
  key,
  title,
  description: description.optional(),
});

export const caseInputSchema = z.object({
  key,
  title,
  description: description.default(""),
  acceptanceCriteria: criteriaSchema.default([]),
  reference: reference.transform((v) => v || undefined).optional(),
});

/** An update: a missing field stays as it is. An empty `reference` clears it; `description: null` clears a group's. */
export const groupPatchSchema = z.object({
  title: title.optional(),
  description: description.nullable().optional(),
});

export const casePatchSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  acceptanceCriteria: criteriaSchema.optional(),
  reference: reference.optional(),
  groupKey: z.string().optional(),
});

export const syncFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    group: groupInputSchema,
    cases: z.array(caseInputSchema),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.cases.forEach((c, i) => {
      if (seen.has(c.key)) {
        ctx.addIssue({ code: "custom", message: `Duplicate key "${c.key}"`, path: ["cases", i, "key"] });
      }
      seen.add(c.key);
    });
  });

export type GroupInput = z.infer<typeof groupInputSchema>;
export type CaseInput = z.infer<typeof caseInputSchema>;
export type SyncFile = z.infer<typeof syncFileSchema>;

export function parseSyncFile(
  input: unknown,
): { ok: true; file: SyncFile } | { ok: false; errors: { path: string; message: string }[] } {
  const r = syncFileSchema.safeParse(input);
  if (r.success) return { ok: true, file: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
  };
}
