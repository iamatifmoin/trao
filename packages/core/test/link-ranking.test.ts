import { describe, expect, it } from "vitest";
import { rankLinks, scoreLink } from "../src/retrieval/link-ranking.js";

const ROOT = "https://acme.example.com";

describe("scoreLink", () => {
  it("scores a hiring-process page higher than a generic marketing page", () => {
    const hiring = scoreLink({ href: `${ROOT}/company/handbook/how-we-hire.html`, text: "Team Handbook" }, ROOT);
    const marketing = scoreLink({ href: `${ROOT}/product.html`, text: "Product" }, ROOT);
    expect(hiring).toBeGreaterThan(marketing);
  });

  it("scores an about page higher than an unrelated blog post", () => {
    const about = scoreLink({ href: `${ROOT}/about.html`, text: "About" }, ROOT);
    const blog = scoreLink({ href: `${ROOT}/blog/index.html`, text: "Blog" }, ROOT);
    expect(about).toBeGreaterThan(blog);
  });

  it("does not depend on a fixed path like /careers being present", () => {
    const buried = scoreLink({ href: `${ROOT}/company/handbook/how-we-hire.html`, text: "How We Hire" }, ROOT);
    expect(buried).toBeGreaterThan(0);
  });
});

describe("rankLinks", () => {
  it("sorts hiring and about pages ahead of noise", () => {
    const links = [
      { href: `${ROOT}/product.html`, text: "Product" },
      { href: `${ROOT}/company/handbook/how-we-hire.html`, text: "Team Handbook" },
      { href: `${ROOT}/blog/index.html`, text: "Blog" },
      { href: `${ROOT}/about.html`, text: "About" },
    ];
    const ranked = rankLinks(links, ROOT);
    expect(ranked[0]!.href).toBe(`${ROOT}/company/handbook/how-we-hire.html`);
    expect(ranked.map((l) => l.href)).toContain(`${ROOT}/about.html`);
  });
});
