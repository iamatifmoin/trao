import { describe, expect, it } from "vitest";
import { initialPracticeState, reviewCard, orderForNextSession, type PracticeCardState } from "../src/practice/sm2.js";

describe("reviewCard", () => {
  it("resets repetitions and schedules a 1-day interval on a low-confidence review", () => {
    const state = initialPracticeState(new Date("2026-01-01T00:00:00Z"));
    const updated = reviewCard(state, 1, new Date("2026-01-01T00:00:00Z"));
    expect(updated.repetitions).toBe(0);
    expect(updated.intervalDays).toBe(1);
    expect(updated.lastConfidence).toBe(1);
  });

  it("grows the interval through the standard SM-2 sequence (1 day, then 6, then EF-scaled) on repeated high confidence", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state = initialPracticeState(now);

    state = reviewCard(state, 5, now);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);

    state = reviewCard(state, 5, now);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);

    state = reviewCard(state, 5, now);
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBeGreaterThan(6); // scaled by the easiness factor, which is > 1
  });

  it("increases the easiness factor on high confidence and decreases it on low confidence", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const base = initialPracticeState(now);

    const afterHigh = reviewCard(base, 5, now);
    expect(afterHigh.easinessFactor).toBeGreaterThanOrEqual(base.easinessFactor);

    const afterLow = reviewCard(base, 1, now);
    expect(afterLow.easinessFactor).toBeLessThan(base.easinessFactor);
  });

  it("never lets the easiness factor drop below the SM-2 floor of 1.3", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    let state: PracticeCardState = { ...initialPracticeState(now), easinessFactor: 1.31 };
    for (let i = 0; i < 5; i++) {
      state = reviewCard(state, 1, now);
    }
    expect(state.easinessFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("schedules dueAt as now + intervalDays", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const state = reviewCard(initialPracticeState(now), 5, now);
    const expectedDue = new Date(now.getTime() + state.intervalDays * 24 * 60 * 60 * 1000);
    expect(new Date(state.dueAt).getTime()).toBe(expectedDue.getTime());
  });
});

describe("orderForNextSession", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("puts never-reviewed cards first", () => {
    const cards = [{ id: "a" }, { id: "b" }];
    const state: Record<string, PracticeCardState> = {
      a: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-02-01T00:00:00Z", lastConfidence: 5 },
    };
    const result = orderForNextSession(cards, state, now);
    expect(result[0]!.id).toBe("b");
  });

  it("puts due cards ahead of not-yet-due cards", () => {
    const cards = [{ id: "notdue" }, { id: "due" }];
    const state: Record<string, PracticeCardState> = {
      notdue: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-02-01T00:00:00Z", lastConfidence: 5 },
      due: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-01-01T00:00:00Z", lastConfidence: 5 },
    };
    const result = orderForNextSession(cards, state, now);
    expect(result[0]!.id).toBe("due");
  });

  it("among due cards, orders least confident first", () => {
    const cards = [{ id: "confident" }, { id: "shaky" }];
    const state: Record<string, PracticeCardState> = {
      confident: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-01-01T00:00:00Z", lastConfidence: 5 },
      shaky: { ...initialPracticeState(now), lastReviewedAt: now.toISOString(), dueAt: "2026-01-01T00:00:00Z", lastConfidence: 1 },
    };
    const result = orderForNextSession(cards, state, now);
    expect(result.map((c) => c.id)).toEqual(["shaky", "confident"]);
  });
});
