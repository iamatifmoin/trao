import { describe, expect, it } from "vitest";
import { computePracticeCoverage } from "../src/practice/coverage.js";
import { initialPracticeState, type PracticeCardState } from "../src/practice/sm2.js";

describe("computePracticeCoverage", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("treats a card with no state at all as never reviewed", () => {
    const result = computePracticeCoverage(["a", "b"], {}, now);
    expect(result.neverReviewedCardIds).toEqual(["a", "b"]);
    expect(result.reviewedCards).toBe(0);
  });

  it("counts a reviewed card and flags it as due when its dueAt has passed", () => {
    const state: Record<string, PracticeCardState> = {
      a: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-01-01T00:00:00Z" },
    };
    const result = computePracticeCoverage(["a"], state, now);
    expect(result.reviewedCards).toBe(1);
    expect(result.neverReviewedCardIds).toEqual([]);
    expect(result.dueCardIds).toEqual(["a"]);
  });

  it("does not flag a reviewed card as due when its dueAt is in the future", () => {
    const state: Record<string, PracticeCardState> = {
      a: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-06-01T00:00:00Z" },
    };
    const result = computePracticeCoverage(["a"], state, now);
    expect(result.dueCardIds).toEqual([]);
  });

  it("reports the correct totals", () => {
    const result = computePracticeCoverage(["a", "b", "c"], {}, now);
    expect(result.totalCards).toBe(3);
  });
});
