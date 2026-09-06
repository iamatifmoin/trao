import { describe, expect, it } from "vitest";
import { validateKit } from "../src/validate.js";
import type { Kit } from "../src/kit.js";

function buildValidKit(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.example.com",
      role: "Senior Backend Engineer",
      location: "Remote",
      jd_chars: 1200,
      researched_at: new Date().toISOString(),
      pages_used: ["https://acme.example.com/careers"],
    },
    company_brief: {
      summary: "Acme builds widgets.",
      what_they_do: "Widget manufacturing SaaS.",
      sources: ["https://acme.example.com/about"],
    },
    role: {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Own the payments service"],
      requirements: [
        { id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "Mentors junior engineers", kind: "behavioural", priority: "nice" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Explain the event loop.",
        answer_outline: "Phases, microtasks vs macrotasks.",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Tell me about mentoring a junior engineer.",
        answer_outline: "STAR: situation, approach, outcome.",
        difficulty: 1,
      },
    ],
    flashcards: [
      { id: "f1", front: "What is the event loop?", back: "...", requirement_ids: ["r1"] },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Technical fundamentals", question_ids: ["q1"], minutes: 60 },
        { day: 2, focus: "Behavioural", question_ids: ["q2"], minutes: 45 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe("validateKit", () => {
  it("accepts a well-formed kit", () => {
    const result = validateKit(buildValidKit());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a schedule day referencing a question that doesn't exist", () => {
    const kit = buildValidKit();
    kit.schedule.days[0]!.question_ids.push("q-does-not-exist");
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("q-does-not-exist"))).toBe(true);
  });

  it("rejects a question referencing an unknown requirement id", () => {
    const kit = buildValidKit();
    kit.questions[0]!.requirement_ids.push("r-ghost");
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("r-ghost"))).toBe(true);
  });

  it("rejects duplicate requirement ids", () => {
    const kit = buildValidKit();
    kit.role.requirements.push({ id: "r1", text: "dup", kind: "technical", priority: "must" });
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate requirement id"))).toBe(true);
  });

  it("rejects a schedule whose day count doesn't match days_available", () => {
    const kit = buildValidKit();
    kit.schedule.days_available = 5;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("days_available"))).toBe(true);
  });

  it("rejects non-integer-shaped input via the zod layer (e.g. bad category)", () => {
    const kit: any = buildValidKit();
    kit.questions[0].category = "not-a-real-category";
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });
});
