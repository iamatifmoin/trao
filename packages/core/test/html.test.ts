import { describe, expect, it } from "vitest";
import { extractFromHtml } from "../src/retrieval/html.js";

describe("extractFromHtml", () => {
  it("strips scripts and styles, and returns visible text", () => {
    const html = `
      <html><head><title>Test Page</title><style>body{color:red}</style></head>
      <body>
        <script>alert('xss')</script>
        <h1>Hello world</h1>
        <p>Some content.</p>
      </body></html>
    `;
    const result = extractFromHtml(html, "https://example.com/");
    expect(result.title).toBe("Test Page");
    expect(result.text).toContain("Hello world");
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain("color:red");
  });

  it("resolves relative links against the base URL and drops non-http(s) schemes", () => {
    const html = `
      <a href="/careers">Careers</a>
      <a href="https://other.example.com/jobs">Jobs</a>
      <a href="mailto:hi@example.com">Email</a>
      <a href="javascript:void(0)">JS</a>
    `;
    const result = extractFromHtml(html, "https://acme.example.com/about");
    const hrefs = result.links.map((l) => l.href);
    expect(hrefs).toContain("https://acme.example.com/careers");
    expect(hrefs).toContain("https://other.example.com/jobs");
    expect(hrefs.some((h) => h.startsWith("mailto:"))).toBe(false);
    expect(hrefs.some((h) => h.startsWith("javascript:"))).toBe(false);
  });

  it("deduplicates links that resolve to the same normalized URL", () => {
    const html = `<a href="/x">One</a><a href="/x#section">Two</a>`;
    const result = extractFromHtml(html, "https://example.com/");
    expect(result.links).toHaveLength(1);
  });
});
