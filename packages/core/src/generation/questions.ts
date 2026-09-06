import { z } from "zod";
import { QuestionCategory } from "@prep-kit/schema";
import { callGeminiJson, wrapUntrusted, UNTRUSTED_CONTENT_POLICY } from "../llm/gemini-client.js";

export interface RequirementForPrompt {
  id: string;
  text: string;
  kind: string;
  priority: string;
}

export interface GeneratedQuestion {
  requirement_ids: string[];
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

export interface GenerateQuestionsInput {
  category: z.infer<typeof QuestionCategory>;
  /** The requirement subset relevant to this category — technical requirements for a technical pass, behavioural for a behavioural pass, etc. */
  requirements: RequirementForPrompt[];
  /** Free-text summary of what the company's hiring/interview pages said, or "" if none were found. */
  hiringSignals: string;
  /** Existing question prompts (edited/manual/already-generated) to avoid duplicating, used during regeneration and gap-filling passes. */
  excludePrompts?: string[];
}

const GenerateQuestionsOutputSchema = z.object({
  questions: z.array(
    z.object({
      requirement_ids: z.array(z.string()),
      prompt: z.string().min(1),
      answer_outline: z.string(),
      difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    }),
  ),
});

// Each category gets its own instructions and (via the caller) its own
// requirement subset — Section 3's "the two should not come from the same
// call with the same instructions" requirement.
const CATEGORY_INSTRUCTIONS: Record<z.infer<typeof QuestionCategory>, string> = {
  technical:
    "Write technical interview questions that probe hands-on depth on the given requirements: implementation detail, trade-offs, debugging scenarios. Avoid generic trivia unrelated to the requirements given.",
  behavioural:
    "Write behavioural interview questions (STAR-style) that probe how the candidate has actually handled situations related to the given requirements: collaboration, conflict, leadership, growth, ambiguity.",
  "system-design":
    "Write system-design interview questions scaled to the seniority implied by the requirements, exercising architecture trade-offs and scale for the kind of system this role would plausibly build or operate.",
  "company-fit":
    "Write questions about why this company and role specifically, grounded only in the hiring-signal material given (what the company says about its process, culture, or what it builds). Do not invent company facts that aren't in the material.",
};

/** One call per category with a distinct requirement subset and distinct instructions — never one call producing every category. */
export async function generateQuestions(input: GenerateQuestionsInput): Promise<GeneratedQuestion[]> {
  if (input.requirements.length === 0 && input.category !== "company-fit") {
    return [];
  }

  const reqBlock = input.requirements
    .map((r) => `- ${r.id} [${r.priority}, ${r.kind}]: ${r.text}`)
    .join("\n");

  const excludeBlock = input.excludePrompts?.length
    ? `\n\nDo not repeat or closely rephrase these existing questions:\n${input.excludePrompts.map((p) => `- ${p}`).join("\n")}`
    : "";

  const systemInstruction = `You write interview questions for a candidate preparing for a specific role. ${UNTRUSTED_CONTENT_POLICY}

${CATEGORY_INSTRUCTIONS[input.category]}

Rules:
- Set requirement_ids to the id(s) of the requirement(s) a question actually tests, chosen only from the ids listed below. Never invent a requirement id. company-fit questions may have an empty requirement_ids array.
- difficulty is an integer 1-3 (1 = warm-up, 3 = hard).
- answer_outline is a short bullet-style outline of what a strong answer covers, not a full essay.
- Return JSON only: { "questions": [{ "requirement_ids": string[], "prompt": string, "answer_outline": string, "difficulty": number }] }`;

  const prompt = `Requirements available for this category:
${reqBlock || "(none — base company-fit questions on the hiring signals only)"}

What is known about this company's hiring/interview process:
${wrapUntrusted("hiring_signals", input.hiringSignals || "No public information about this company's interview process was found.")}${excludeBlock}`;

  const result = await callGeminiJson(prompt, GenerateQuestionsOutputSchema, {
    systemInstruction,
    temperature: 0.5,
  });

  const validIds = new Set(input.requirements.map((r) => r.id));
  return result.questions.map((q) => ({
    ...q,
    requirement_ids: q.requirement_ids.filter((id) => validIds.has(id)),
  }));
}
