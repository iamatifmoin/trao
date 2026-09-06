import type { FetchedPage } from "../retrieval/fetch-page.js";
import { STRONG_HIRING_KEYWORDS, COMPANY_INFO_KEYWORDS } from "../retrieval/link-ranking.js";

export type PageSignal = "hiring" | "about" | "other";

export interface ClassifiedPage {
  page: FetchedPage;
  signal: PageSignal;
}

/**
 * Buckets already-crawled pages into hiring-signal vs. about vs. noise,
 * reusing the same keyword heuristic the crawler used to decide what to
 * fetch in the first place. Deliberately not an LLM call — Section 3 never
 * lists "classify pages" as a required generation step, and there's no
 * reason to spend free-tier tokens re-deriving something the crawl's own
 * ranking already knows.
 */
export function classifyPages(pages: FetchedPage[]): ClassifiedPage[] {
  return pages.map((page) => ({ page, signal: classifySinglePage(page) }));
}

function classifySinglePage(page: FetchedPage): PageSignal {
  const haystack = `${page.finalUrl} ${page.title}`.toLowerCase();

  const hiringHits = STRONG_HIRING_KEYWORDS.filter((kw) => haystack.includes(kw)).length;
  const aboutHits = COMPANY_INFO_KEYWORDS.filter((kw) => haystack.includes(kw)).length;

  if (hiringHits === 0 && aboutHits === 0) return "other";
  return hiringHits >= aboutHits ? "hiring" : "about";
}

const TITLE_SEPARATORS = /[|–—:-]/;

/** Best-effort display name from the root page's <title>, falling back to a capitalized hostname. */
export function deriveCompanyName(rootPage: FetchedPage | undefined, companyUrl: string): string {
  const title = rootPage?.title?.trim();
  if (title) {
    const candidate = title.split(TITLE_SEPARATORS)[0]?.trim();
    if (candidate && candidate.length > 0 && candidate.length <= 60) {
      return candidate;
    }
  }

  try {
    const hostname = new URL(companyUrl).hostname.replace(/^www\./, "");
    const primaryLabel = hostname.split(".")[0] ?? hostname;
    return primaryLabel
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Unknown Company";
  }
}

const MAX_HIRING_SIGNAL_CHARS = 4000;

/** Concatenates the strongest hiring-signal material (crawled pages + search snippets) into one text block for the question-generation prompts. Empty string is a valid, honest result. */
export function buildHiringSignalsText(
  classifiedPages: ClassifiedPage[],
  searchSnippets: { title: string; snippet: string }[],
): string {
  const parts: string[] = [];

  for (const { page, signal } of classifiedPages) {
    if (signal !== "hiring") continue;
    parts.push(`${page.title}\n${page.text}`);
  }

  for (const s of searchSnippets) {
    parts.push(`${s.title}\n${s.snippet}`);
  }

  const combined = parts.join("\n\n---\n\n");
  return combined.length > MAX_HIRING_SIGNAL_CHARS ? combined.slice(0, MAX_HIRING_SIGNAL_CHARS) : combined;
}
