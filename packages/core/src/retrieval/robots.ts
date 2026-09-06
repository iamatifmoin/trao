export interface RobotsRules {
  disallow: string[];
}

/**
 * Minimal robots.txt parser: reads the group matching our user-agent (falls
 * back to "*"), collects its Disallow paths. Good enough for the sites this
 * project talks to; doesn't handle Allow overrides, wildcards or crawl-delay.
 */
export function parseRobots(txt: string, userAgent = "*"): RobotsRules {
  const lines = txt.split("\n").map((l) => l.trim());
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.disallow.length > 0) {
        current = { agents: [value.toLowerCase()], disallow: [] };
        groups.push(current);
      } else {
        current.agents.push(value.toLowerCase());
      }
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    }
  }

  const exact = groups.find((g) => g.agents.includes(userAgent.toLowerCase()));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  return { disallow: (exact ?? wildcard)?.disallow ?? [] };
}

export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  return !rules.disallow.some((rule) => rule === "/" || pathname.startsWith(rule));
}
