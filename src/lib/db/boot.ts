import { dbErrorLabel, isTransientDbError } from "./errors";

export type RetryOptions = {
  /** How long to keep retrying transient errors, from the first attempt. */
  timeoutMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (line: string) => void;
};

/**
 * Runs `connect` until it succeeds, retrying transient connection errors (the database is not up yet, as when
 * it starts alongside the app) with doubling delays. Rethrows any other error at once, and the last transient
 * one when the deadline has passed.
 */
export async function connectWithRetry<T>(connect: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    timeoutMs = 60_000,
    initialDelayMs = 1000,
    maxDelayMs = 5000,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    log = console.log,
  } = opts;
  const deadline = now() + timeoutMs;
  for (let delay = initialDelayMs; ; delay = Math.min(delay * 2, maxDelayMs)) {
    try {
      return await connect();
    } catch (err) {
      const remaining = deadline - now();
      if (!isTransientDbError(err) || remaining <= 0) throw err;
      log(`[boot] database not reachable yet (${dbErrorLabel(err)}), retrying…`);
      await sleep(Math.min(delay, remaining));
    }
  }
}

/** The line logged when boot fails on the database: the error code and the target, never the error message. */
export function dbBootErrorLine(err: unknown, target: string): string {
  return `[boot] database error (${dbErrorLabel(err)}): ${target}`;
}
