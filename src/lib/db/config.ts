export type DbConfig = { dialect: "sqlite"; path: string } | { dialect: "pg"; url: string };

const PG_SCHEMES = new Set(["postgres:", "postgresql:"]);

/**
 * Picks the backend: a postgres:// or postgresql:// DATABASE_URL selects Postgres (DATABASE_PATH is ignored),
 * an unset or empty one selects SQLite at DATABASE_PATH. Errors never echo the URL, which may hold credentials.
 */
export function resolveDbConfig(env: { DATABASE_URL?: string; DATABASE_PATH: string }): DbConfig {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") return { dialect: "sqlite", path: env.DATABASE_PATH };
  const scheme = parseUrl(url).protocol;
  if (PG_SCHEMES.has(scheme)) return { dialect: "pg", url };
  throw new Error(
    `Unsupported DATABASE_URL scheme "${scheme}". Use postgres:// or postgresql://, or leave DATABASE_URL empty to use SQLite.`,
  );
}

/** One line for the boot log: never includes the user, password or query string. */
export function describeDbConfig(cfg: DbConfig): string {
  if (cfg.dialect === "sqlite") return `sqlite ${cfg.path}`;
  const u = parseUrl(cfg.url);
  return `postgres ${u.host}${u.pathname}`;
}

/**
 * Accepts only `<scheme>://…` whose credentials, if any, parsed as credentials:
 * - Without the `//`, `admin:s3cret@db/x` still parses, with the username as its "scheme", and would reach
 *   the unsupported-scheme error that echoes the scheme.
 * - An unencoded `/`, `?` or `#` in the password ends the authority early, so `postgres://admin:2024/s3cret@h/db`
 *   parses with no username and the credentials as host, port and path, which the boot log would print.
 */
function parseUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Deliberately drop the cause: its message contains the input.
    throw invalidUrl();
  }
  if (url.slice(parsed.protocol.length, parsed.protocol.length + 2) !== "//") throw invalidUrl();
  if (url.includes("@") && parsed.username === "") throw invalidUrl();
  return parsed;
}

const invalidUrl = () =>
  new Error("DATABASE_URL is not a valid URL. If the password contains special characters, percent-encode them.");
