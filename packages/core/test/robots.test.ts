import { describe, expect, it } from "vitest";
import { parseRobots, isPathAllowed } from "../src/retrieval/robots.js";

describe("parseRobots", () => {
  it("parses Disallow rules under a wildcard user-agent group", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /internal/\nDisallow: /admin\n");
    expect(rules.disallow).toEqual(["/internal/", "/admin"]);
  });

  it("returns no rules for an allow-all robots.txt", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n");
    expect(rules.disallow).toEqual([]);
  });

  it("ignores comments and blank lines", () => {
    const rules = parseRobots("# comment\n\nUser-agent: *\n\nDisallow: /private/\n");
    expect(rules.disallow).toEqual(["/private/"]);
  });
});

describe("isPathAllowed", () => {
  it("blocks a path matching a disallow rule", () => {
    expect(isPathAllowed({ disallow: ["/internal/"] }, "/internal/secrets")).toBe(false);
  });

  it("allows a path not matching any rule", () => {
    expect(isPathAllowed({ disallow: ["/internal/"] }, "/about")).toBe(true);
  });

  it("blocks everything when the rule is a bare slash", () => {
    expect(isPathAllowed({ disallow: ["/"] }, "/anything")).toBe(false);
  });
});
