import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPage, FetchPageError } from "../src/retrieval/fetch-page.js";
import { startStaticServer, type StaticServer } from "./helpers/static-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACME_ROOT = path.join(__dirname, "../../../fixtures/acme");

describe("fetchPage", () => {
  let server: StaticServer;

  beforeAll(async () => {
    server = await startStaticServer(ACME_ROOT);
  });

  afterAll(async () => {
    await server.close();
  });

  it("fetches and cleans an HTML page", async () => {
    const page = await fetchPage(`${server.origin}/about.html`, { allowPrivateNetworks: true });
    expect(page.status).toBe(200);
    expect(page.title).toBe("About Acme");
    expect(page.text).toContain("Founded in 2015");
  });

  it("blocks a loopback address when private networks are not allowed", async () => {
    await expect(fetchPage(`${server.origin}/about.html`, { allowPrivateNetworks: false })).rejects.toThrow(FetchPageError);
  });

  it("throws HTTP_ERROR on a 404", async () => {
    await expect(fetchPage(`${server.origin}/does-not-exist.html`, { allowPrivateNetworks: true })).rejects.toMatchObject({
      code: "HTTP_ERROR",
    });
  });

  it("enforces the byte cap", async () => {
    await expect(
      fetchPage(`${server.origin}/about.html`, { allowPrivateNetworks: true, maxBytes: 10 }),
    ).rejects.toMatchObject({ code: "PAGE_TOO_LARGE" });
  });
});
