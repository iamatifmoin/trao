import { KitSchema, type Kit } from "./kit.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a kit against the Appendix A shape (via zod) plus the
 * referential-integrity rules the schema alone can't express: every id
 * referenced by a question, flashcard, schedule day or coverage entry must
 * resolve to an id that actually exists in the kit.
 */
export function validateKit(candidate: unknown): ValidationResult {
  const parsed = KitSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    };
  }

  const errors: string[] = [];
  const kit = parsed.data;

  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));
  const questionIds = new Set(kit.questions.map((q) => q.id));
  const flashcardIds = new Set(kit.flashcards.map((f) => f.id));

  checkUnique(kit.role.requirements.map((r) => r.id), "requirement", errors);
  checkUnique(kit.questions.map((q) => q.id), "question", errors);
  checkUnique(kit.flashcards.map((f) => f.id), "flashcard", errors);

  for (const q of kit.questions) {
    for (const rid of q.requirement_ids) {
      if (!requirementIds.has(rid)) {
        errors.push(`question ${q.id} references unknown requirement_id "${rid}"`);
      }
    }
  }

  for (const f of kit.flashcards) {
    for (const rid of f.requirement_ids) {
      if (!requirementIds.has(rid)) {
        errors.push(`flashcard ${f.id} references unknown requirement_id "${rid}"`);
      }
    }
  }

  for (const rid of kit.coverage.uncovered_requirement_ids) {
    if (!requirementIds.has(rid)) {
      errors.push(`coverage.uncovered_requirement_ids references unknown requirement_id "${rid}"`);
    }
  }

  if (kit.schedule.days.length !== kit.schedule.days_available) {
    errors.push(
      `schedule has ${kit.schedule.days.length} day(s) but days_available is ${kit.schedule.days_available}`,
    );
  }

  const seenDayNumbers = new Set<number>();
  for (const day of kit.schedule.days) {
    if (seenDayNumbers.has(day.day)) {
      errors.push(`schedule has duplicate day number ${day.day}`);
    }
    seenDayNumbers.add(day.day);

    for (const qid of day.question_ids) {
      if (!questionIds.has(qid)) {
        errors.push(`schedule day ${day.day} references unknown question_id "${qid}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function checkUnique(ids: string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      errors.push(`duplicate ${label} id "${id}"`);
    }
    seen.add(id);
  }
}

export type { Kit };
