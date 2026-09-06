import { describe, expect, it } from "vitest";
import { allocateSchedule, type ScheduleQuestionInput, type ScheduleRequirementInput } from "../src/deterministic/schedule.js";

function q(id: string, difficulty: 1 | 2 | 3, requirement_ids: string[], category = "technical"): ScheduleQuestionInput {
  return { id, difficulty, requirement_ids, category };
}

describe("allocateSchedule", () => {
  it("produces exactly the number of days requested, regardless of material", () => {
    for (const days of [1, 3, 5, 60]) {
      const result = allocateSchedule([q("q1", 2, ["r1"])], [{ id: "r1", priority: "must" }], days);
      expect(result).toHaveLength(days);
      expect(result.map((d) => d.day)).toEqual(Array.from({ length: days }, (_, i) => i + 1));
    }
  });

  it("gives every day an integer minutes value", () => {
    const questions = [q("q1", 1, []), q("q2", 2, []), q("q3", 3, []), q("q4", 2, [])];
    const result = allocateSchedule(questions, [], 3);
    for (const day of result) {
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it("schedules every must-have requirement's question somewhere in the plan", () => {
    const requirements: ScheduleRequirementInput[] = [
      { id: "r1", priority: "must" },
      { id: "r2", priority: "nice" },
      { id: "r3", priority: "must" },
    ];
    const questions = [q("q1", 1, ["r1"]), q("q2", 2, ["r2"]), q("q3", 3, ["r3"]), q("q4", 1, [])];
    const result = allocateSchedule(questions, requirements, 2);
    const scheduledIds = new Set(result.flatMap((d) => d.question_ids));
    expect(scheduledIds.has("q1")).toBe(true);
    expect(scheduledIds.has("q3")).toBe(true);
  });

  it("front-loads must-linked and harder material onto earlier days", () => {
    const requirements: ScheduleRequirementInput[] = [
      { id: "r1", priority: "must" },
      { id: "r2", priority: "nice" },
    ];
    // A hard must-have question and an easy nice-to-have question, spread across many low-value fillers
    // so a single day can't hold everything and ordering actually matters.
    const questions = [
      q("filler1", 1, []),
      q("filler2", 1, []),
      q("nice-easy", 1, ["r2"]),
      q("must-hard", 3, ["r1"]),
      q("filler3", 1, []),
    ];
    const result = allocateSchedule(questions, requirements, 5);
    const dayOf = (id: string) => result.find((d) => d.question_ids.includes(id))!.day;
    expect(dayOf("must-hard")).toBeLessThan(dayOf("nice-easy"));
  });

  it("never leaves a day empty when there is at least one question per day available", () => {
    const requirements: ScheduleRequirementInput[] = [
      { id: "r1", priority: "must" },
      { id: "r2", priority: "nice" },
    ];
    const questions = [
      q("filler1", 1, []),
      q("filler2", 1, []),
      q("nice-easy", 1, ["r2"]),
      q("must-hard", 3, ["r1"]),
      q("filler3", 1, []),
    ];
    const result = allocateSchedule(questions, requirements, 5);
    for (const day of result) {
      expect(day.question_ids.length).toBeGreaterThan(0);
    }
  });

  it("drops no question when there is more material than days (must all be scheduled once)", () => {
    const questions = Array.from({ length: 10 }, (_, i) => q(`q${i}`, ((i % 3) + 1) as 1 | 2 | 3, []));
    const result = allocateSchedule(questions, [], 3);
    const scheduledIds = new Set(result.flatMap((d) => d.question_ids));
    expect(scheduledIds.size).toBe(10);
  });

  it("crams everything into a single day when only one day is available, without dropping anything", () => {
    const questions = Array.from({ length: 6 }, (_, i) => q(`q${i}`, 2, []));
    const result = allocateSchedule(questions, [], 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.question_ids).toHaveLength(6);
    expect(result[0]!.minutes).toBe(6 * 15);
  });

  it("flags an overloaded single day honestly in its focus label", () => {
    const questions = Array.from({ length: 10 }, (_, i) => q(`q${i}`, 3, []));
    const result = allocateSchedule(questions, [], 1);
    expect(result[0]!.focus).toMatch(/longer than ideal/i);
  });

  it("spaces reviews across extra days when there are fewer questions than days requested", () => {
    const requirements: ScheduleRequirementInput[] = [{ id: "r1", priority: "must" }];
    const questions = [q("q1", 2, ["r1"]), q("q2", 1, [])];
    const result = allocateSchedule(questions, requirements, 5);
    expect(result).toHaveLength(5);
    // First two days introduce the new material.
    expect(result[0]!.question_ids).toEqual(["q1"]);
    expect(result[1]!.question_ids).toEqual(["q2"]);
    // Remaining days recycle earlier questions as review, at reduced minutes.
    for (const day of result.slice(2)) {
      expect(day.question_ids.length).toBeGreaterThan(0);
      expect(day.focus).toMatch(/review/i);
    }
    expect(result[2]!.minutes).toBeLessThan(result[0]!.minutes);
  });

  it("never references a question id that wasn't in the input", () => {
    const questions = [q("q1", 1, []), q("q2", 2, []), q("q3", 3, [])];
    const result = allocateSchedule(questions, [], 7);
    const validIds = new Set(questions.map((qq) => qq.id));
    for (const day of result) {
      for (const id of day.question_ids) expect(validIds.has(id)).toBe(true);
    }
  });

  it("returns days_available empty-but-valid days when there are no questions yet", () => {
    const result = allocateSchedule([], [], 4);
    expect(result).toHaveLength(4);
    for (const day of result) {
      expect(day.question_ids).toEqual([]);
      expect(day.minutes).toBe(0);
    }
  });

  it("rejects a non-integer or non-positive day count", () => {
    expect(() => allocateSchedule([q("q1", 1, [])], [], 0)).toThrow();
    expect(() => allocateSchedule([q("q1", 1, [])], [], 2.5)).toThrow();
  });
});
