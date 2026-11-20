import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const unitInclude = ["tests/**/*.test.{ts,tsx}"];
// Database tests run once per backend; everything else runs once, in `unit`.
const dbInclude = ["tests/db/**/*.test.{ts,tsx}"];

const hasPostgres = Boolean(process.env.TEST_POSTGRES_URL);
if (!hasPostgres) console.log("[test] TEST_POSTGRES_URL not set: skipping the real-Postgres project");

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    projects: [
      {
        extends: true,
        test: { name: "unit", include: unitInclude, exclude: [...configDefaults.exclude, "tests/db/**"] },
      },
      { extends: true, test: { name: "db:sqlite", include: dbInclude, env: { TEST_DB: "sqlite" } } },
      {
        extends: true,
        test: {
          name: "db:pglite",
          include: dbInclude,
          env: { TEST_DB: "pglite" },
          // The first tests in a worker start PGlite and migrate it, which can pass 5 s under load.
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
      ...(hasPostgres
        ? [
            {
              extends: true,
              test: {
                name: "db:postgres",
                include: dbInclude,
                env: { TEST_DB: "postgres" },
                fileParallelism: false,
              },
            },
          ]
        : []),
    ],
  },
});
