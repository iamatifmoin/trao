export interface PracticeCardState {
  repetitions: number;
  easinessFactor: number;
  intervalDays: number;
  dueAt: string;
  lastReviewedAt: string | null;
  lastConfidence: number | null;
}

export function initialPracticeState(now: Date = new Date()): PracticeCardState {
  return {
    repetitions: 0,
    easinessFactor: 2.5,
    intervalDays: 0,
    dueAt: now.toISOString(),
    lastReviewedAt: null,
    lastConfidence: null,
  };
}

/**
 * SM-2 spaced repetition (SuperMemo-2). `confidence` is a 1-5 self-rating
 * (1 = no idea, 5 = knew it cold) used directly as SM-2's quality score —
 * a documented simplification of the original 0-5 scale, since a plain
 * confidence rating has no need for the "total blackout vs. incorrect but
 * familiar" distinction the extra point at the bottom exists for.
 *
 * Chosen over a plain confidence-weighted sort because it does something a
 * sort can't: it schedules *when* a card should resurface, not just how it
 * ranks against the others right now, so a card someone nailed doesn't
 * clutter tomorrow's session even though the app currently has no other
 * signal about it.
 */
export function reviewCard(state: PracticeCardState, confidence: number, now: Date = new Date()): PracticeCardState {
  const q = Math.min(5, Math.max(1, Math.round(confidence)));

  let repetitions: number;
  let intervalDays: number;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(state.intervalDays * state.easinessFactor);
  }

  const rawEasiness = state.easinessFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const easinessFactor = Math.round(Math.max(1.3, rawEasiness) * 100) / 100;

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    repetitions,
    easinessFactor,
    intervalDays,
    dueAt: dueAt.toISOString(),
    lastReviewedAt: now.toISOString(),
    lastConfidence: q,
  };
}

interface HasId {
  id: string;
}

/**
 * Due cards (or never-reviewed ones) come first, then sorted by ascending
 * confidence — "order the next session by what they were least confident
 * about" (Section 7), layered on top of SM-2's due dates rather than
 * instead of them.
 */
export function orderForNextSession<T extends HasId>(
  cards: T[],
  practiceState: Record<string, PracticeCardState>,
  now: Date = new Date(),
): T[] {
  const scored = cards.map((card) => {
    const state = practiceState[card.id];
    const isDue = !state || new Date(state.dueAt).getTime() <= now.getTime();
    const confidence = state?.lastConfidence ?? 0;
    return { card, isDue, confidence };
  });

  scored.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    return a.confidence - b.confidence;
  });

  return scored.map((s) => s.card);
}
