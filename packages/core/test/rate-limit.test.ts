import { describe, expect, it } from "vitest";
import { HostRateLimiter } from "../src/retrieval/rate-limit.js";

describe("HostRateLimiter", () => {
  it("spaces out sequential calls to the same host", async () => {
    const limiter = new HostRateLimiter(50);
    const start = Date.now();
    await limiter.wait("h");
    await limiter.wait("h");
    await limiter.wait("h");
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  it("spaces out calls fired concurrently instead of letting a burst through", async () => {
    const limiter = new HostRateLimiter(50);
    const start = Date.now();
    const timestamps: number[] = [];

    await Promise.all(
      Array.from({ length: 4 }, () =>
        limiter.wait("h").then(() => {
          timestamps.push(Date.now() - start);
        }),
      ),
    );

    timestamps.sort((a, b) => a - b);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]! - timestamps[i - 1]!).toBeGreaterThanOrEqual(40);
    }
  });

  it("does not throttle unrelated hosts against each other", async () => {
    const limiter = new HostRateLimiter(200);
    const start = Date.now();
    await Promise.all([limiter.wait("a"), limiter.wait("b")]);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
