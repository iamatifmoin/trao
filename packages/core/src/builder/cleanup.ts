import type { Kit } from "@prep-kit/schema";

/** Deleting a requirement must not leave a dangling requirement_id on any question or flashcard. */
export function removeRequirementReferences(kit: Kit, requirementId: string): void {
  for (const q of kit.questions) q.requirement_ids = q.requirement_ids.filter((id) => id !== requirementId);
  for (const f of kit.flashcards) f.requirement_ids = f.requirement_ids.filter((id) => id !== requirementId);
}

/** Deleting a question must not leave a dangling question_id in the schedule. */
export function removeQuestionReferences(kit: Kit, questionId: string): void {
  for (const day of kit.schedule.days) day.question_ids = day.question_ids.filter((id) => id !== questionId);
}

/**
 * Filters every schedule day's question_ids down to ids that still exist in
 * kit.questions. A single-question delete can use removeQuestionReferences
 * directly; a bulk change like regenerating a whole category can silently
 * drop several questions at once, so this re-validates the schedule against
 * whatever the question set ends up being, rather than tracking exactly
 * which ids were removed.
 */
export function pruneDanglingScheduleReferences(kit: Kit): void {
  const validIds = new Set(kit.questions.map((q) => q.id));
  for (const day of kit.schedule.days) {
    day.question_ids = day.question_ids.filter((id) => validIds.has(id));
  }
}
