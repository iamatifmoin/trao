import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPublicDiscussion } from "../src/search/tavily.js";

const originalApiKey = process.env.TAVILY_API_KEY;
const originalFetch = global.fetch;

describe("searchPublicDiscussion", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("returns an empty array when no API key is configured, rather than throwing", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await searchPublicDiscussion("Acme");
    expect(result).toEqual([]);
  });

  it("maps Tavily results to the internal shape", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: "Acme interview experience", url: "https://blind.example.com/acme", content: "Panel then take-home." }],
      }),
    } as Response);

    const result = await searchPublicDiscussion("Acme");
    expect(result).toEqual([
      { title: "Acme interview experience", url: "https://blind.example.com/acme", snippet: "Panel then take-home." },
    ]);
  });

  it("returns an empty array (not an error) when the provider stays rate-limited after retries", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response);
    const result = await searchPublicDiscussion("Acme");
    expect(result).toEqual([]);
  });
});
