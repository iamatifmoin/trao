import * as cheerio from "cheerio";

export interface ExtractedLink {
  href: string;
  text: string;
}

export interface ExtractedPage {
  title: string;
  text: string;
  links: ExtractedLink[];
}

/**
 * Strips scripts/styles and pulls visible text plus same-document links,
 * resolved to absolute URLs against baseUrl. Non-http(s) links (mailto:,
 * tel:, javascript:) are dropped since nothing downstream can fetch them.
 */
export function extractFromHtml(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, template").remove();

  const title = $("title").first().text().trim();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return;

    resolved.hash = "";
    const normalized = resolved.toString();
    if (seen.has(normalized)) return;
    seen.add(normalized);

    links.push({ href: normalized, text: $(el).text().replace(/\s+/g, " ").trim() });
  });

  return { title, text, links };
}
