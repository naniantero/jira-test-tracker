// CLI-only config for `npm run auth:generate:sqlite`. Not imported by the app.
import { createDb } from "@/lib/db";
import { createAuth } from "./auth";

// Top-level await: the CLI loads this file as an ES module.
export const auth = createAuth(await createDb({ dialect: "sqlite", path: ":memory:" }), {
  secret: "cli-only-secret-cli-only-secret-cli-only",
  baseURL: "http://localhost:3000",
});
