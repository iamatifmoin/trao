import { describe, expect, it } from "vitest";
import { computeWeakSpots } from "../src/practice/weak-spots.js";
import type { PracticeCardState } from "../src/practice/sm2.js";

function cardState(confidence: number): PracticeCardState {
  return {
    repetitions: 1,
    easinessFactor: 2.5,
    intervalDays: 1,
    dueAt: "2026-06-01T00:00:00Z",
    lastReviewedAt: "2026-01-01T00:00:00Z",
    lastConfidence: confidence,
  };
}

describe("computeWeakSpots", () => {
  it("ranks a never-practiced requirement below a practiced one, regardless of the practiced score", () => {
    const requirements = [
      { id: "r1", text: "React", priority: "must" as const },
      { id: "r2", text: "Node", priority: "must" as const },
    ];
    const flashcards = [
      { id: "f1", requirement_ids: ["r1"] },
      { id: "f2", requirement_ids: ["r2"] },
    ];
    const practiceState = { f2: cardState(5) }; // r2's card reviewed with high confidence; r1 never touched

    const result = computeWeakSpots(requirements, flashcards, practiceState);
    expect(result[0]!.requirementId).toBe("r1");
    expect(result[0]!.averageConfidence).toBeNull();
    expect(result[1]!.requirementId).toBe("r2");
  });

  it("ranks lower average confidence as a weaker spot", () => {
    const requirements = [
      { id: "r1", text: "React", priority: "must" as const },
      { id: "r2", text: "Node", priority: "must" as const },
    ];
    const flashcards = [
      { id: "f1", requirement_ids: ["r1"] },
      { id: "f2", requirement_ids: ["r2"] },
    ];
    const practiceState = { f1: cardState(2), f2: cardState(4) };

    const result = computeWeakSpots(requirements, flashcards, practiceState);
    expect(result.map((r) => r.requirementId)).toEqual(["r1", "r2"]);
  });

  it("averages confidence across multiple flashcards linked to the same requirement", () => {
    const requirements = [{ id: "r1", text: "React", priority: "must" as const }];
    const flashcards = [
      { id: "f1", requirement_ids: ["r1"] },
      { id: "f2", requirement_ids: ["r1"] },
    ];
    const practiceState = { f1: cardState(2), f2: cardState(4) };

    const result = computeWeakSpots(requirements, flashcards, practiceState);
    expect(result[0]!.averageConfidence).toBe(3);
    expect(result[0]!.reviewedCardCount).toBe(2);
  });

  it("breaks a tie in confidence by ranking must-priority as weaker (more urgent) than nice", () => {
    const requirements = [
      { id: "r1", text: "Nice-to-have", priority: "nice" as const },
      { id: "r2", text: "Must-have", priority: "must" as const },
    ];
    const flashcards = [
      { id: "f1", requirement_ids: ["r1"] },
      { id: "f2", requirement_ids: ["r2"] },
    ];
    const practiceState = { f1: cardState(3), f2: cardState(3) };

    const result = computeWeakSpots(requirements, flashcards, practiceState);
    expect(result[0]!.requirementId).toBe("r2");
  });
});
