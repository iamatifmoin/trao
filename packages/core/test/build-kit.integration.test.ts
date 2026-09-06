import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateKit } from "@prep-kit/schema";
import { buildKit } from "../src/pipeline/build-kit.js";
import { startStaticServer, type StaticServer } from "./helpers/static-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACME_ROOT = path.join(__dirname, "../../../fixtures/acme");

const THIN_JD = "Backend Engineer.\nMust have 3+ years of Python experience.";

const FULL_JD = `Senior Backend Engineer

We build the platform that powers our widget-simulation product.

Requirements:
- 5+ years of experience with Python and distributed systems (required)
- Experience mentoring junior engineers
- Strong communication skills, required

Nice to have:
- Bonus points for experience with Kubernetes`;

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!hasGeminiKey)("buildKit (end-to-end, live Gemini + local fixture site)", () => {
  let server: StaticServer;

  beforeAll(async () => {
    server = await startStaticServer(ACME_ROOT);
  });

  afterAll(async () => {
    await server.close();
  });

  it("produces a structurally valid kit covering every must-have requirement", async () => {
    const { kit, warnings } = await buildKit({
      jd: FULL_JD,
      companyUrl: server.origin,
      daysAvailable: 3,
      allowPrivateNetworks: true,
    });

    const validation = validateKit(kit);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    expect(kit.source.company.length).toBeGreaterThan(0);
    expect(kit.source.pages_used.length).toBeGreaterThan(0);
    expect(kit.source.pages_used.some((u) => u.includes("how-we-hire"))).toBe(true);

    const mustIds = kit.role.requirements.filter((r) => r.priority === "must").map((r) => r.id);
    expect(mustIds.length).toBeGreaterThan(0);
    for (const id of mustIds) {
      expect(kit.coverage.uncovered_requirement_ids).not.toContain(id);
    }

    expect(kit.schedule.days_available).toBe(3);
    expect(kit.schedule.days).toHaveLength(3);

    expect(Array.isArray(warnings)).toBe(true);
  }, 120_000);

  it("produces an honest, thin kit for a thin job description without inventing requirements", async () => {
    const { kit } = await buildKit({
      jd: THIN_JD,
      companyUrl: server.origin,
      daysAvailable: 2,
      allowPrivateNetworks: true,
    });

    expect(kit.role.requirements.length).toBeLessThanOrEqual(3);
    expect(validateKit(kit).valid).toBe(true);
  }, 120_000);

  it("produces an honest company brief and non-fatal warnings when the company site is unreachable", async () => {
    const { kit, warnings } = await buildKit({
      jd: THIN_JD,
      companyUrl: "http://127.0.0.1:1/",
      daysAvailable: 2,
      allowPrivateNetworks: true,
    });

    expect(validateKit(kit).valid).toBe(true);
    expect(kit.source.pages_used).toEqual([]);
    expect(kit.company_brief.sources).toEqual([]);
    expect(warnings.some((w) => /could not be crawled/i.test(w))).toBe(true);
  }, 120_000);
});
