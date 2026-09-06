import { withRetry } from "../retrieval/rate-limit.js";

export interface TavilySearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface TavilyApiResponseItem {
  title?: string;
  url?: string;
  content?: string;
}

/**
 * Looks for public discussion of a company's interview process. An empty
 * array is a valid, honest outcome — a company nobody has written about
 * publicly (or a local fixture host with no web presence) should not be
 * treated as a search failure.
 */
export async function searchPublicDiscussion(companyName: string): Promise<TavilySearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !companyName.trim()) return [];

  const query = `${companyName} interview process questions experience`;

  try {
    return await withRetry(
      async () => {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 5,
            search_depth: "basic",
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (response.status === 429) throw new Error("TAVILY_RATE_LIMITED");
        if (!response.ok) throw new Error(`TAVILY_HTTP_${response.status}`);

        const data = (await response.json()) as { results?: TavilyApiResponseItem[] };
        return (data.results ?? []).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: r.content ?? "",
        }));
      },
      {
        retries: 2,
        baseDelayMs: 2000,
        shouldRetry: (err) =>
          err instanceof Error && (err.message === "TAVILY_RATE_LIMITED" || err.message.startsWith("TAVILY_HTTP_5")),
      },
    );
  } catch {
    // Unreachable or still rate-limited after retries — report as "nothing
    // found" rather than failing the whole kit over one research source.
    return [];
  }
}
