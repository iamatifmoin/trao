import { z } from "zod";
import { callGeminiJson, UNTRUSTED_CONTENT_POLICY } from "../llm/gemini-client.js";

export interface QuestionForFlashcards {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
  requirement_ids: string[];
}

const GenerateFlashcardsOutputSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string().min(1),
      back: z.string().min(1),
      requirement_ids: z.array(z.string()),
    }),
  ),
});

const SYSTEM_INSTRUCTION = `You convert interview questions into quick-recall flashcards. ${UNTRUSTED_CONTENT_POLICY}

Rules:
- front is a short prompt or term to recall, back is a concise answer — a few lines, not an essay.
- Carry over the same requirement_ids as the question the flashcard is drawn from; use only ids that already appear on the source questions, never invent one.
- Not every question needs a flashcard, and a dense requirement can get more than one. Aim for good recall coverage, not a strict one-to-one mapping with questions.
- Return JSON only: { "flashcards": [{ "front": string, "back": string, "requirement_ids": string[] }] }`;

export async function generateFlashcards(questions: QuestionForFlashcards[]): Promise<GeneratedFlashcard[]> {
  if (questions.length === 0) return [];

  const qBlock = questions
    .map(
      (q) =>
        `- [${q.category}] Q: ${q.prompt}\n  Outline: ${q.answer_outline}\n  requirement_ids: ${q.requirement_ids.join(", ") || "(none)"}`,
    )
    .join("\n");

  const prompt = `Questions to build flashcards from:\n${qBlock}`;

  const result = await callGeminiJson(prompt, GenerateFlashcardsOutputSchema, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.4,
  });

  const validIds = new Set(questions.flatMap((q) => q.requirement_ids));
  return result.flashcards.map((f) => ({
    ...f,
    requirement_ids: f.requirement_ids.filter((id) => validIds.has(id)),
  }));
}
