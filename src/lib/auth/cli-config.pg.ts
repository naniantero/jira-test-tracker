// CLI-only config for `npm run auth:generate:pg` (schema generation only). Not imported by the app.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { createAuthFor } from "./auth";

// Never connected: schema generation reads only the auth options and the provider.
// `schema` is intentionally empty so this works before src/lib/db/schemas/auth-pg.ts exists.
export const auth = createAuthFor(
  { orm: drizzle(new Pool({ connectionString: "postgres://cli@localhost/cli" })), provider: "pg", schema: {} },
  { secret: "cli-only-secret-cli-only-secret-cli-only", baseURL: "http://localhost:3000" },
);
