import { fetchPage, isRetryableFetchError, type FetchedPage } from "./fetch-page.js";
import { rankLinks } from "./link-ranking.js";
import { parseRobots, isPathAllowed, type RobotsRules } from "./robots.js";
import { HostRateLimiter, withRetry } from "./rate-limit.js";

export interface SkippedPage {
  url: string;
  reason: string;
}

export interface CrawlResult {
  pages: FetchedPage[];
  skipped: SkippedPage[];
}

export interface CrawlOptions {
  allowPrivateNetworks?: boolean;
  /** Total fetch budget for the crawl, including the root page. */
  maxPages?: number;
  maxDepth?: number;
  rateLimiter?: HostRateLimiter;
}

const DEFAULT_MAX_PAGES = 8;
const DEFAULT_MAX_DEPTH = 2;

/**
 * Breadth-first crawl of a company site: fetches the root, ranks every
 * discovered same-origin link by how strongly it signals "hiring/interview
 * page" or "about the company", and follows the top-ranked ones up to a
 * page and depth budget. Every unreachable or disallowed page is recorded
 * in `skipped` rather than aborting the crawl.
 */
export async function crawlCompany(rootUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const allowPrivateNetworks = opts.allowPrivateNetworks ?? false;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
  const rateLimiter = opts.rateLimiter ?? new HostRateLimiter();

  const skipped: SkippedPage[] = [];
  const visited = new Set<string>();
  const pages: FetchedPage[] = [];

  let rootOrigin: string;
  try {
    rootOrigin = new URL(rootUrl).origin;
  } catch {
    return { pages: [], skipped: [{ url: rootUrl, reason: "invalid company URL" }] };
  }

  const robotsRules = await fetchRobotsRules(rootOrigin, allowPrivateNetworks);

  const fetchIfAllowed = async (url: string): Promise<FetchedPage | null> => {
    if (visited.has(url)) return null;
    visited.add(url);

    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      skipped.push({ url, reason: "invalid URL" });
      return null;
    }

    if (!isPathAllowed(robotsRules, pathname)) {
      skipped.push({ url, reason: "disallowed by robots.txt" });
      return null;
    }

    await rateLimiter.wait(new URL(url).host);

    try {
      return await withRetry(() => fetchPage(url, { allowPrivateNetworks }), {
        retries: 2,
        baseDelayMs: 500,
        shouldRetry: isRetryableFetchError,
      });
    } catch (err) {
      skipped.push({ url, reason: err instanceof Error ? err.message : "unknown error" });
      return null;
    }
  };

  const root = await fetchIfAllowed(rootUrl);
  if (!root) {
    return { pages: [], skipped };
  }
  pages.push(root);

  let frontier = root.links.filter((l) => new URL(l.href).origin === rootOrigin);
  let depth = 1;

  while (pages.length < maxPages && frontier.length > 0 && depth <= maxDepth) {
    const ranked = rankLinks(frontier, rootOrigin).filter((l) => !visited.has(l.href));
    const nextFrontier: typeof frontier = [];

    for (const link of ranked) {
      if (pages.length >= maxPages) break;
      const page = await fetchIfAllowed(link.href);
      if (page) {
        pages.push(page);
        nextFrontier.push(...page.links.filter((l) => new URL(l.href).origin === rootOrigin));
      }
    }

    frontier = nextFrontier;
    depth++;
  }

  return { pages, skipped };
}

async function fetchRobotsRules(origin: string, allowPrivateNetworks: boolean): Promise<RobotsRules> {
  try {
    const robotsPage = await fetchPage(`${origin}/robots.txt`, { allowPrivateNetworks });
    return parseRobots(robotsPage.text);
  } catch {
    // No robots.txt, or it's unreachable — robots.txt convention treats that as allow-all.
    return { disallow: [] };
  }
}
