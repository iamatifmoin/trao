import type { ExtractedLink } from "./html.js";

// Weighted by how directly the keyword signals "this is a hiring/interview
// page" vs. a more general company page. Section 2 warns a fixed path list
// is not sufficient, so this ranks candidates by signal rather than
// hard-coding "/careers".
export const STRONG_HIRING_KEYWORDS = [
  "career",
  "careers",
  "job",
  "jobs",
  "hiring",
  "interview",
  "interviewing",
  "recruit",
  "handbook",
  "how-we-hire",
  "join-us",
  "join-the-team",
  "work-with-us",
];

export const COMPANY_INFO_KEYWORDS = ["about", "company", "who-we-are", "mission"];

export const WEAK_SIGNAL_KEYWORDS = ["team", "culture", "engineering", "life-at", "blog"];

export function scoreLink(link: ExtractedLink, rootOrigin: string): number {
  let url: URL;
  try {
    url = new URL(link.href);
  } catch {
    return -Infinity;
  }

  const haystack = `${url.pathname} ${link.text}`.toLowerCase();
  let score = 0;

  for (const kw of STRONG_HIRING_KEYWORDS) {
    if (haystack.includes(kw)) score += 3;
  }
  for (const kw of COMPANY_INFO_KEYWORDS) {
    if (haystack.includes(kw)) score += 2;
  }
  for (const kw of WEAK_SIGNAL_KEYWORDS) {
    if (haystack.includes(kw)) score += 1;
  }

  if (url.origin === rootOrigin) score += 1;

  const depth = url.pathname.split("/").filter(Boolean).length;
  score -= Math.max(0, depth - 2) * 0.5;

  return score;
}

export function rankLinks(links: ExtractedLink[], rootOrigin: string): ExtractedLink[] {
  return [...links].sort((a, b) => scoreLink(b, rootOrigin) - scoreLink(a, rootOrigin));
}
