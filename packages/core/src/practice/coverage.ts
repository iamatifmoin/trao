import type { PracticeCardState } from "./sm2.js";

export interface PracticeCoverage {
  totalCards: number;
  reviewedCards: number;
  neverReviewedCardIds: string[];
  dueCardIds: string[];
}

/** "Show what has been covered and what has not" (Section 7). */
export function computePracticeCoverage(
  cardIds: string[],
  practiceState: Record<string, PracticeCardState>,
  now: Date = new Date(),
): PracticeCoverage {
  const neverReviewedCardIds: string[] = [];
  const dueCardIds: string[] = [];
  let reviewedCards = 0;

  for (const id of cardIds) {
    const state = practiceState[id];
    if (!state || state.lastReviewedAt === null) {
      neverReviewedCardIds.push(id);
      continue;
    }
    reviewedCards++;
    if (new Date(state.dueAt).getTime() <= now.getTime()) {
      dueCardIds.push(id);
    }
  }

  return { totalCards: cardIds.length, reviewedCards, neverReviewedCardIds, dueCardIds };
}
