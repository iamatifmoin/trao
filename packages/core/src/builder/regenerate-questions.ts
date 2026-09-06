import type { Question, Requirement } from "@prep-kit/schema";
import { generateQuestions, type RequirementForPrompt } from "../generation/questions.js";
import { checkCoverage } from "../deterministic/coverage.js";
import { createIdSequence } from "./id-sequence.js";
import { isProtected, freshGeneratedMeta } from "./item-state.js";

function toPromptReq(r: Requirement): RequirementForPrompt {
  return { id: r.id, text: r.text, kind: r.kind, priority: r.priority };
}

function matchesCategory(category: Question["category"], requirement: Requirement): boolean {
  if (category === "behavioural") return requirement.kind === "behavioural";
  if (category === "company-fit") return false;
  return requirement.kind === "technical" || requirement.kind === "domain";
}

export interface RegenerateQuestionCategoryResult {
  /** The full, updated question list across every category — other categories are returned untouched. */
  questions: Question[];
  uncoveredRequirementIds: string[];
}

/**
 * Regenerates one question category. Questions in that category that are
 * edited, hand-written, or pinned survive untouched — Section 6's explicit
 * requirement that "a question the user wrote or edited by hand must
 * survive a regeneration of its category." Questions in every other
 * category are never even read. Runs one bounded top-up pass if replacing
 * the category leaves a must-have requirement newly uncovered.
 */
export async function regenerateQuestionCategory(
  category: Question["category"],
  existingQuestions: Question[],
  requirements: Requirement[],
  hiringSignals: string,
): Promise<RegenerateQuestionCategoryResult> {
  const untouched = existingQuestions.filter((q) => q.category !== category);
  const protectedInCategory = existingQuestions.filter((q) => q.category === category && isProtected(q._meta));

  const nextId = createIdSequence(existingQuestions.map((q) => q.id), "q");
  const relevantReqs = requirements.filter((r) => matchesCategory(category, r)).map(toPromptReq);
  const excludePrompts = protectedInCategory.map((q) => q.prompt);

  const generated = await generateQuestions({ category, requirements: relevantReqs, hiringSignals, excludePrompts });
  const freshQuestions: Question[] = generated.map((g) => ({
    id: nextId(),
    requirement_ids: g.requirement_ids,
    category,
    prompt: g.prompt,
    answer_outline: g.answer_outline,
    difficulty: g.difficulty,
    _meta: freshGeneratedMeta(0),
  }));

  let merged = [...untouched, ...protectedInCategory, ...freshQuestions];
  let coverage = checkCoverage(requirements, merged);

  if (coverage.uncoveredMustRequirementIds.length > 0) {
    const gapReqs = requirements.filter(
      (r) => coverage.uncoveredMustRequirementIds.includes(r.id) && matchesCategory(category, r),
    );
    if (gapReqs.length > 0) {
      const topUp = await generateQuestions({
        category,
        requirements: gapReqs.map(toPromptReq),
        hiringSignals,
        excludePrompts: merged.map((q) => q.prompt),
      });
      const topUpQuestions: Question[] = topUp.map((g) => ({
        id: nextId(),
        requirement_ids: g.requirement_ids,
        category,
        prompt: g.prompt,
        answer_outline: g.answer_outline,
        difficulty: g.difficulty,
        _meta: freshGeneratedMeta(0),
      }));
      merged = [...merged, ...topUpQuestions];
      coverage = checkCoverage(requirements, merged);
    }
  }

  const withOrder = merged.map((q, i) => ({ ...q, _meta: { ...q._meta, order: i } }));

  return { questions: withOrder, uncoveredRequirementIds: coverage.uncoveredRequirementIds };
}
