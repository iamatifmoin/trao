import { describe, expect, it } from "vitest";
import type { Question, Requirement, CompanyBrief } from "@prep-kit/schema";
import { regenerateQuestionCategory } from "../src/builder/regenerate-questions.js";
import { regenerateCompanyBrief, BriefPinnedError } from "../src/builder/regenerate-brief.js";

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!hasGeminiKey)("regenerateQuestionCategory (live Gemini)", () => {
  it("keeps edited/manual/pinned questions in the category untouched, replaces the rest, and never touches other categories", async () => {
    const requirements: Requirement[] = [
      { id: "r1", text: "5+ years with React", kind: "technical", priority: "must" },
      { id: "r2", text: "Mentors junior engineers", kind: "behavioural", priority: "nice" },
    ];

    const existing: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "My own hand-written question about React.",
        answer_outline: "My own outline.",
        difficulty: 2,
        _meta: { origin: "edited", pinned: false, order: 0, revision: 1 },
      },
      {
        id: "q2",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "A generated question that should be replaced.",
        answer_outline: "...",
        difficulty: 1,
        _meta: { origin: "generated", pinned: false, order: 1, revision: 0 },
      },
      {
        id: "q3",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "A behavioural question that must not be touched by a technical regen.",
        answer_outline: "...",
        difficulty: 1,
        _meta: { origin: "generated", pinned: false, order: 2, revision: 0 },
      },
    ];

    const result = await regenerateQuestionCategory("technical", existing, requirements, "");

    // The hand-edited question survives with its id and prompt intact.
    const survivor = result.questions.find((q) => q.id === "q1");
    expect(survivor?.prompt).toBe("My own hand-written question about React.");

    // The plain generated technical question was replaced (q2 gone or a fresh id took its place).
    expect(result.questions.some((q) => q.id === "q2")).toBe(false);

    // The behavioural question is completely untouched.
    const untouched = result.questions.find((q) => q.id === "q3");
    expect(untouched?.prompt).toBe("A behavioural question that must not be touched by a technical regen.");

    // New ids don't collide with any existing id.
    const ids = result.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 60_000);
});

describe.skipIf(!hasGeminiKey)("regenerateCompanyBrief (live Gemini)", () => {
  const currentBrief: CompanyBrief = { summary: "old", what_they_do: "old", sources: [] };

  it("regenerates when not pinned", async () => {
    const result = await regenerateCompanyBrief({
      companyUrl: "https://example.com",
      currentBrief,
      briefPages: [{ url: "https://example.com/about", title: "About", text: "Acme builds widgets for factories." }],
      searchSnippets: [],
    });
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result._meta?.origin).toBe("generated");
  }, 30_000);

  it("refuses to regenerate when pinned", async () => {
    const pinned: CompanyBrief = { ...currentBrief, _meta: { pinned: true } };
    await expect(
      regenerateCompanyBrief({ companyUrl: "https://example.com", currentBrief: pinned, briefPages: [], searchSnippets: [] }),
    ).rejects.toBeInstanceOf(BriefPinnedError);
  });
});
