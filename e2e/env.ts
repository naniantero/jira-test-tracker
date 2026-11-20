/**
 * The e2e database, as playwright.config.ts passes it to the app: Postgres when `E2E_DATABASE_URL` is set (its
 * database name must contain "e2e"), SQLite otherwise. `DATABASE_URL` is always set, so that one from the shell
 * never points the e2e server or the CLI at another database.
 */
export const E2E_DB_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
  DATABASE_PATH: "./e2e/.data/app.db",
};
