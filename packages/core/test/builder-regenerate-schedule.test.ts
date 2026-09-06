import { describe, expect, it } from "vitest";
import { regenerateSchedule } from "../src/builder/regenerate-schedule.js";
import type { Question, Requirement } from "@prep-kit/schema";

describe("regenerateSchedule", () => {
  it("recomputes across exactly the requested number of days from the current questions", () => {
    const questions: Question[] = [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "", answer_outline: "", difficulty: 2 },
      { id: "q2", requirement_ids: [], category: "behavioural", prompt: "", answer_outline: "", difficulty: 1 },
    ];
    const requirements: Requirement[] = [{ id: "r1", text: "", kind: "technical", priority: "must" }];

    const schedule = regenerateSchedule(questions, requirements, 4);
    expect(schedule.days_available).toBe(4);
    expect(schedule.days).toHaveLength(4);

    const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    expect(scheduledIds.has("q1")).toBe(true);
    expect(scheduledIds.has("q2")).toBe(true);
  });

  it("reflects a smaller question set after deletions (fewer ids to schedule)", () => {
    const questions: Question[] = [
      { id: "q1", requirement_ids: [], category: "technical", prompt: "", answer_outline: "", difficulty: 1 },
    ];
    const schedule = regenerateSchedule(questions, [], 2);
    const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    expect(scheduledIds).toEqual(new Set(["q1"]));
  });
});
