import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_ENV } from "./e2e/env";

const PORT = 4101;
const baseURL = `http://localhost:${PORT}`;
const FAKE_S3_PORT = 4103;
// An IP, not `localhost`: the fake listens on 127.0.0.1 only, and `localhost` may resolve to ::1 first.
const fakeS3URL = `http://127.0.0.1:${FAKE_S3_PORT}`;
const S3_CREDENTIALS = { AWS_ACCESS_KEY_ID: "e2e-access-key", AWS_SECRET_ACCESS_KEY: "e2e-secret-key" };

/**
 * The app stores attachments in `scripts/fake-s3.ts`. Specs share one database prepared by
 * `scripts/e2e-prepare.ts` (test cases from `e2e/fixtures/cases/`), so they run serially in file-name order (01-…,
 * 02-…) and build on each other's state. Logins reuse storage states saved by the `setup` project: the login rate
 * limit is 5 per minute per IP. No retries — a retry would repeat state changes and form logins.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: /\d+-.*\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "tsx scripts/fake-s3.ts",
      url: `${fakeS3URL}/_health`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      env: { FAKE_S3_PORT: String(FAKE_S3_PORT), ...S3_CREDENTIALS },
    },
    {
      command: `tsx scripts/e2e-prepare.ts && next build && next start -p ${PORT}`,
      url: `${baseURL}/api/health`,
      // Always start fresh: a reused server would skip the database reset.
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
      env: {
        ...E2E_DB_ENV,
        ATTACHMENTS_BUCKET_URL: `s3://e2e-attachments?endpoint=${encodeURIComponent(fakeS3URL)}&region=us-east-1`,
        ...S3_CREDENTIALS,
        // Keep a profile or session token from the shell away from the fake.
        AWS_PROFILE: "",
        AWS_SESSION_TOKEN: "",
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_SECRET: "e2e-only-secret-not-for-production-0123456789",
        // Users come from e2e-prepare; keep any local bootstrap admin out of the e2e database.
        ADMIN_USERNAME: "",
        ADMIN_PASSWORD: "",
      },
    },
  ],
});
