import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { callGeminiJson } from "../src/llm/gemini-client.js";
import { HostRateLimiter } from "../src/retrieval/rate-limit.js";

const Schema = z.object({ value: z.string() });
const originalApiKey = process.env.GEMINI_API_KEY;
const originalFetch = global.fetch;

function geminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    text: async () => text,
  } as Response;
}

describe("callGeminiJson", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("returns parsed data on a well-formed first response", async () => {
    global.fetch = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ value: "ok" })));
    const result = await callGeminiJson("prompt", Schema, { rateLimiter: new HostRateLimiter(0) });
    expect(result).toEqual({ value: "ok" });
  });

  it("strips markdown code fences before parsing", async () => {
    global.fetch = vi.fn().mockResolvedValue(geminiResponse('```json\n{"value":"ok"}\n```'));
    const result = await callGeminiJson("prompt", Schema, { rateLimiter: new HostRateLimiter(0) });
    expect(result).toEqual({ value: "ok" });
  });

  it("makes one repair attempt after malformed JSON, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("not json at all"))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({ value: "fixed" })));
    global.fetch = fetchMock;
    const result = await callGeminiJson("prompt", Schema, { rateLimiter: new HostRateLimiter(0) });
    expect(result).toEqual({ value: "fixed" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with INVALID_JSON if the repair attempt also fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(geminiResponse("still not json"));
    await expect(
      callGeminiJson("prompt", Schema, { rateLimiter: new HostRateLimiter(0) }),
    ).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("retries after a 429 and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limited" } as Response)
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({ value: "ok" })));
    global.fetch = fetchMock;
    const result = await callGeminiJson("prompt", Schema, {
      rateLimiter: new HostRateLimiter(0),
      baseDelayMs: 10,
    });
    expect(result).toEqual({ value: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws NOT_CONFIGURED when no API key is set", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(callGeminiJson("prompt", Schema, { rateLimiter: new HostRateLimiter(0) })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});
