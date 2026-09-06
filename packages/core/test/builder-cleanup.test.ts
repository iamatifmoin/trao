import { describe, expect, it } from "vitest";
import { removeRequirementReferences, removeQuestionReferences } from "../src/builder/cleanup.js";
import type { Kit } from "@prep-kit/schema";

function minimalKit(): Kit {
  return {
    source: { company: "", company_url: "", role: "", location: "", jd_chars: 0, researched_at: "", pages_used: [] },
    company_brief: { summary: "", what_they_do: "", sources: [] },
    role: {
      title: "",
      seniority: "",
      responsibilities: [],
      requirements: [
        { id: "r1", text: "a", kind: "technical", priority: "must" },
        { id: "r2", text: "b", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      { id: "q1", requirement_ids: ["r1", "r2"], category: "technical", prompt: "", answer_outline: "", difficulty: 1 },
      { id: "q2", requirement_ids: ["r2"], category: "behavioural", prompt: "", answer_outline: "", difficulty: 1 },
    ],
    flashcards: [{ id: "f1", front: "", back: "", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "", question_ids: ["q1"], minutes: 10 },
        { day: 2, focus: "", question_ids: ["q1", "q2"], minutes: 10 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("removeRequirementReferences", () => {
  it("strips the requirement id from every question and flashcard that referenced it", () => {
    const kit = minimalKit();
    removeRequirementReferences(kit, "r1");
    expect(kit.questions[0]!.requirement_ids).toEqual(["r2"]);
    expect(kit.questions[1]!.requirement_ids).toEqual(["r2"]);
    expect(kit.flashcards[0]!.requirement_ids).toEqual([]);
  });

  it("leaves references to other requirements untouched", () => {
    const kit = minimalKit();
    removeRequirementReferences(kit, "r1");
    expect(kit.questions[0]!.requirement_ids).toContain("r2");
  });
});

describe("removeQuestionReferences", () => {
  it("strips the question id from every schedule day that referenced it", () => {
    const kit = minimalKit();
    removeQuestionReferences(kit, "q1");
    expect(kit.schedule.days[0]!.question_ids).toEqual([]);
    expect(kit.schedule.days[1]!.question_ids).toEqual(["q2"]);
  });
});
