export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enforces a minimum gap between requests to the same host, so a crawl
 * doesn't hammer a company's site and so a burst of concurrent LLM calls
 * (e.g. generating several question categories at once) gets spaced out
 * instead of firing together. Per-host so one slow host doesn't throttle
 * requests to another.
 *
 * Each call to wait() chains onto the previous one for that host via
 * .then(), rather than reading-then-writing a shared timestamp directly —
 * plain read-then-write breaks under concurrency, because several calls
 * fired in the same tick (e.g. via Promise.all) would all read the same
 * stale "last request" time before any of them had a chance to update it,
 * letting the whole burst through at once instead of being spaced out.
 * Chaining forces each call to wait its turn behind the one before it.
 */
export class HostRateLimiter {
  private chains = new Map<string, Promise<number>>();

  constructor(private minIntervalMs = 500) {}

  async wait(host: string): Promise<void> {
    const previous = this.chains.get(host) ?? Promise.resolve(0);
    const current = previous.then(async (lastRequestAt) => {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < this.minIntervalMs) {
        await sleep(this.minIntervalMs - elapsed);
      }
      return Date.now();
    });
    this.chains.set(host, current);
    await current;
  }
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  shouldRetry: (err: unknown) => boolean;
}

/** Exponential backoff retry — used for both page fetches and LLM/search calls that get rate-limited. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > opts.retries || !opts.shouldRetry(err)) throw err;
      await sleep(opts.baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
