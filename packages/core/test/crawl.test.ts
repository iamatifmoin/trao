import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crawlCompany } from "../src/retrieval/crawl.js";
import { startStaticServer, type StaticServer } from "./helpers/static-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(__dirname, "../../../fixtures");

describe("crawlCompany", () => {
  let acmeServer: StaticServer;
  let noHiringServer: StaticServer;

  beforeAll(async () => {
    acmeServer = await startStaticServer(path.join(FIXTURES_ROOT, "acme"));
    noHiringServer = await startStaticServer(path.join(FIXTURES_ROOT, "nohiring"));
  });

  afterAll(async () => {
    await acmeServer.close();
    await noHiringServer.close();
  });

  it("finds a hiring page buried at an unpredictable path, not a hard-coded one", async () => {
    const result = await crawlCompany(acmeServer.origin, { allowPrivateNetworks: true });
    const hiringPage = result.pages.find((p) => p.finalUrl.includes("how-we-hire"));
    expect(hiringPage).toBeDefined();
    expect(hiringPage!.text).toContain("take-home exercise");
    expect(result.skipped.every((s) => !s.url.includes("how-we-hire"))).toBe(true);
  });

  it("also picks up the about page for company-brief material", async () => {
    const result = await crawlCompany(acmeServer.origin, { allowPrivateNetworks: true });
    const aboutPage = result.pages.find((p) => p.finalUrl.endsWith("/about.html"));
    expect(aboutPage).toBeDefined();
    expect(aboutPage!.text).toContain("remote-first");
  });

  it("respects robots.txt disallow rules", async () => {
    const result = await crawlCompany(acmeServer.origin, { allowPrivateNetworks: true, maxPages: 20 });
    expect(result.pages.every((p) => !p.finalUrl.includes("/internal/"))).toBe(true);
  });

  it("returns pages but no hiring signal when the company site genuinely has none", async () => {
    const result = await crawlCompany(noHiringServer.origin, { allowPrivateNetworks: true });
    expect(result.pages.length).toBeGreaterThan(0);
    const hiringPage = result.pages.find((p) =>
      /career|hiring|interview|handbook/i.test(p.finalUrl) || /career|hiring|interview/i.test(p.text),
    );
    expect(hiringPage).toBeUndefined();
  });

  it("records an unreachable root as skipped rather than throwing", async () => {
    const result = await crawlCompany("http://127.0.0.1:1/", { allowPrivateNetworks: true });
    expect(result.pages).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThan(0);
  });
});
