/**
 * Helpers for logging and classifying database errors without their messages: pg messages can name the role
 * (`password authentication failed for user "tracker"`), and Drizzle's wrappers repeat the failed query.
 */

/** Connection failures worth waiting out at boot: the server is not up, not resolvable or still starting. */
const TRANSIENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET", "57P03"]);
/** pg's own messages for a connection that closed or timed out while connecting; they carry no code. */
const PG_TERMINATED = /^Connection terminated( unexpectedly| due to connection timeout)?$/;
const IDENTIFIER = /^[A-Za-z0-9_]{1,64}$/;

/** The error, the errors it wraps (`cause`, AggregateError's `errors`), and theirs, breadth first. */
function errorChain(err: unknown): unknown[] {
  const seen: unknown[] = [];
  const queue = [err];
  while (queue.length > 0 && seen.length < 16) {
    const e = queue.shift();
    if (e === undefined || e === null || seen.includes(e)) continue;
    seen.push(e);
    if (e instanceof Error) {
      queue.push(e.cause);
      if (e instanceof AggregateError) queue.push(...e.errors);
    }
  }
  return seen;
}

function codeOf(e: unknown): string | undefined {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" && code !== "" ? code : undefined;
}

export function isTransientDbError(err: unknown): boolean {
  return errorChain(err).some((e) => {
    const code = codeOf(e);
    if (code !== undefined) return TRANSIENT_CODES.has(code);
    return e instanceof Error && PG_TERMINATED.test(e.message);
  });
}

/** A short, message-free label for logs: the first error code in the chain, else the error's class name. */
export function dbErrorLabel(err: unknown): string {
  const code = errorChain(err)
    .map(codeOf)
    .find((c) => c !== undefined);
  if (code !== undefined) return IDENTIFIER.test(code) ? code : "unknown";
  return err instanceof Error && IDENTIFIER.test(err.name) ? err.name : "unknown";
}
