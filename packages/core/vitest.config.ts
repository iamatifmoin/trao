import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15000,
    setupFiles: ["./test/setup.ts"],
    // Vitest runs test files in parallel worker processes by default. The
    // shared Gemini rate limiter is an in-process singleton, so parallel
    // files each get their own independent copy and can't coordinate
    // spacing across each other — multiple files' live-API tests would fire
    // concurrently and trip the real per-minute rate limit even though each
    // file paces its own calls correctly. Sequential file execution avoids
    // this; the live tests already dominate the suite's wall-clock time, so
    // there's little parallelism to lose.
    fileParallelism: false,
  },
});
