import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schemas/pg.ts",
  out: "./drizzle/pg",
});
