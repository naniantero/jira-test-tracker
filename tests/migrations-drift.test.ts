import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const dialects = {
  sqlite: { dialect: "sqlite", schema: "src/lib/db/schemas/sqlite.ts" },
  pg: { dialect: "postgresql", schema: "src/lib/db/schemas/pg.ts" },
} as const;

const sqlFiles = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

let tmp: string | undefined;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

describe("migrations drift", () => {
  it.each(["sqlite", "pg"] as const)(
    "%s migrations are up to date with the schema",
    (name) => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), `drift-${name}-`));
      const out = path.join(tmp, "migrations");
      fs.cpSync(path.join(root, "drizzle", name), out, { recursive: true });
      const before = sqlFiles(out);

      // No `defineConfig` import: the config lives outside the repo, where drizzle-kit cannot be resolved.
      // `out` must be relative: drizzle-kit prefixes it with "./".
      const config = path.join(tmp, "drizzle.config.ts");
      const { dialect, schema } = dialects[name];
      fs.writeFileSync(
        config,
        `export default ${JSON.stringify({ dialect, schema: path.join(root, schema), out: path.relative(root, out) })};\n`,
      );
      const output = execFileSync("npx", ["drizzle-kit", "generate", "--config", config], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      });

      expect(sqlFiles(out)).toEqual(before);
      // drizzle-kit exits 0 even when it fails to read the migrations, so also require its verdict.
      expect(output).toContain("No schema changes");
    },
    60_000,
  );
});
