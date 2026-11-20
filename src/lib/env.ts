import { readFileSync } from "node:fs";
import { z } from "zod";
import { parseBucketUrl } from "@/lib/attachments/bucket-url";

const envSchema = z
  .object({
    /** postgres:// or postgresql:// selects Postgres; unset or empty selects SQLite at DATABASE_PATH. */
    DATABASE_URL: z.string().optional(),
    DATABASE_PATH: z.string().min(1).default("./data/app.db"),
    /** Where attachments are stored (see `bucket-url.ts`); unset disables attachments. */
    ATTACHMENTS_BUCKET_URL: z
      .string()
      .optional()
      .superRefine((url, ctx) => {
        if (url === undefined) return;
        try {
          parseBucketUrl(url);
        } catch (err) {
          ctx.addIssue({ code: "custom", message: (err as Error).message });
        }
      }),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().url(),
    ADMIN_USERNAME: z.string().min(3).max(32).optional(),
    ADMIN_PASSWORD: z.string().min(10).optional(),
  })
  .refine((e) => (e.ADMIN_USERNAME === undefined) === (e.ADMIN_PASSWORD === undefined), {
    message: "ADMIN_USERNAME and ADMIN_PASSWORD must be set together",
    path: ["ADMIN_PASSWORD"],
  });

export type Env = z.output<typeof envSchema>;

/** Treat empty strings (e.g. `FOO=` in .env files) as unset. */
function clean(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(clean(source));
}

/** Secrets that can come from a file named by `<NAME>_FILE`, as mounted by a secret store's volume. */
const FILE_SECRETS = ["DATABASE_URL", "BETTER_AUTH_SECRET", "ADMIN_PASSWORD"] as const;

/** Fills each secret from the file named by its `<NAME>_FILE`, dropping one trailing newline. */
export function readSecretFiles(
  source: Record<string, string | undefined>,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Record<string, string | undefined> {
  const result = { ...source };
  for (const name of FILE_SECRETS) {
    const path = source[`${name}_FILE`];
    if (!path) continue;
    if (source[name]) throw new Error(`Set ${name} or ${name}_FILE, not both`);
    let content: string;
    try {
      content = readFile(path);
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      throw new Error(`Could not read ${name}_FILE (${path})${typeof code === "string" ? `: ${code}` : ""}`);
    }
    result[name] = content.replace(/\r?\n$/, "");
  }
  return result;
}

let cached: Env | undefined;

/** Parses process.env (and the secret files it names) on first call and caches it. Never call at module top level. */
export function getEnv(): Env {
  return (cached ??= parseEnv(readSecretFiles(process.env)));
}
