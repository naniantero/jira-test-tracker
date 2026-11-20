// Bundles the `tt` CLI into dist/cli.mjs (copied into the image as /app/cli.mjs). The database drivers stay
// external: they resolve from the node_modules next to it (the standalone output's, in the image).
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/cli.mjs",
  external: ["@libsql/client", "pg", "@electric-sql/pglite"],
  alias: { "@": "./src" },
  // Bundled CommonJS dependencies call require(), which an ES module does not define.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  logLevel: "warning",
});
