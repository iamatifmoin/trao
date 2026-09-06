import type { Question, Requirement, Schedule } from "@prep-kit/schema";
import { allocateSchedule } from "../deterministic/schedule.js";

/**
 * Recomputes the schedule from the kit's current question set — deterministic,
 * so it always reflects live edits/deletes, and never touches any other
 * section (nothing to "preserve elsewhere" since it only reads, never writes,
 * questions or requirements).
 */
export function regenerateSchedule(questions: Question[], requirements: Requirement[], daysAvailable: number): Schedule {
  const days = allocateSchedule(
    questions.map((q) => ({ id: q.id, category: q.category, difficulty: q.difficulty, requirement_ids: q.requirement_ids })),
    requirements.map((r) => ({ id: r.id, priority: r.priority })),
    daysAvailable,
  );
  return { days_available: daysAvailable, days };
}
