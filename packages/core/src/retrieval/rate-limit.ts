export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enforces a minimum gap between requests to the same host, so a crawl
 * doesn't hammer a company's site. Per-host so crawling one slow host
 * doesn't throttle requests to another.
 */
export class HostRateLimiter {
  private lastRequestAt = new Map<string, number>();

  constructor(private minIntervalMs = 500) {}

  async wait(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestAt.set(host, Date.now());
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
