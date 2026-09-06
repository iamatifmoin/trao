import { describe, expect, it } from "vitest";
import { extractRequirements } from "../src/generation/extract-requirements.js";
import { generateQuestions } from "../src/generation/questions.js";
import { generateFlashcards } from "../src/generation/flashcards.js";
import { buildCompanyBrief } from "../src/generation/company-brief.js";

// These hit the real Gemini API and are skipped when no key is configured,
// so `npm test` still works in a clean environment. Run with GEMINI_API_KEY
// set to actually validate the prompts against the live model.
const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!hasGeminiKey)("generation steps (live Gemini)", () => {
  it("extracts only what's stated from a thin two-line job description, without padding", async () => {
    const jd = "Backend Engineer.\nMust know Python.";
    const requirements = await extractRequirements(jd);
    expect(requirements.length).toBeGreaterThan(0);
    expect(requirements.length).toBeLessThanOrEqual(3);
    expect(requirements.some((r) => /python/i.test(r.text))).toBe(true);
  }, 30_000);

  it("distinguishes must vs nice from a fuller description's own wording", async () => {
    const jd = `Senior Backend Engineer

Requirements:
- 5+ years of experience with Node.js and distributed systems (required)
- Experience mentoring junior engineers

Nice to have:
- Bonus points for experience with Kubernetes`;
    const requirements = await extractRequirements(jd);
    const nodeReq = requirements.find((r) => /node/i.test(r.text));
    const k8sReq = requirements.find((r) => /kubernetes/i.test(r.text));
    expect(nodeReq?.priority).toBe("must");
    expect(k8sReq?.priority).toBe("nice");
  }, 30_000);

  it("generates technical and behavioural questions from separate calls that only reference their own requirement ids", async () => {
    const technical = await generateQuestions({
      category: "technical",
      requirements: [{ id: "r1", text: "5+ years with React", kind: "technical", priority: "must" }],
      hiringSignals: "",
    });
    expect(technical.length).toBeGreaterThan(0);
    for (const q of technical) {
      for (const id of q.requirement_ids) expect(id).toBe("r1");
    }

    const behavioural = await generateQuestions({
      category: "behavioural",
      requirements: [{ id: "r2", text: "Mentors junior engineers", kind: "behavioural", priority: "nice" }],
      hiringSignals: "",
    });
    expect(behavioural.length).toBeGreaterThan(0);
    for (const q of behavioural) {
      for (const id of q.requirement_ids) expect(id).toBe("r2");
    }
  }, 60_000);

  it("builds flashcards that inherit requirement ids from their source questions", async () => {
    const flashcards = await generateFlashcards([
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Explain React's reconciliation algorithm.",
        answer_outline: "Virtual DOM diffing, keys, fiber scheduling.",
      },
    ]);
    expect(flashcards.length).toBeGreaterThan(0);
    for (const f of flashcards) {
      for (const id of f.requirement_ids) expect(id).toBe("r1");
    }
  }, 30_000);
});

describe("buildCompanyBrief", () => {
  it("returns an honest empty brief without calling the model when nothing was retrieved", async () => {
    const brief = await buildCompanyBrief({ companyUrl: "https://nowhere.example.com", pages: [], searchSnippets: [] });
    expect(brief.sources).toEqual([]);
    expect(brief.summary.toLowerCase()).toContain("no information");
  });
});
