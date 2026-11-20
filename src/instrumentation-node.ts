import { getAuth } from "@/lib/auth/auth";
import { seedAdmin } from "@/lib/auth/users";
import * as db from "@/lib/db";
import { connectWithRetry, dbBootErrorLine } from "@/lib/db/boot";
import { getEnv } from "@/lib/env";

// Next caches a rejected register(): the server would stay up and answer every request with 500, so restart
// policies would never fire. Every boot failure therefore exits the process.
function fail(line: string): never {
  console.error(line);
  process.exit(1);
}

export async function registerNode(): Promise<void> {
  let env: ReturnType<typeof getEnv>;
  let target: string;
  try {
    env = getEnv();
    target = db.describeDbConfig(db.resolveDbConfig(env));
  } catch (err) {
    // Configuration errors never echo DATABASE_URL, which may hold credentials.
    return fail(`[boot] ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log(`[boot] database: ${target}`);

  try {
    // Waits for a database that starts alongside the app. A Postgres pool connects lazily, so the first
    // migration query is what reaches the server.
    const appDb = await connectWithRetry(async () => {
      const d = await db.getDb();
      await db.migrateDb(d);
      return d;
    });

    const creds =
      env.ADMIN_USERNAME && env.ADMIN_PASSWORD
        ? { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }
        : undefined;
    if ((await seedAdmin(await getAuth(), appDb, creds)) === "created") {
      console.log("[boot] admin seeded");
    }
  } catch (err) {
    // Only the code: pg error messages can name the role.
    fail(dbBootErrorLine(err, target));
  }
}
