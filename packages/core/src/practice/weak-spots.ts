import type { PracticeCardState } from "./sm2.js";

export interface WeakSpotRequirement {
  id: string;
  text: string;
  priority: "must" | "nice";
}

export interface WeakSpotFlashcard {
  id: string;
  requirement_ids: string[];
}

export interface WeakSpotEntry {
  requirementId: string;
  requirementText: string;
  priority: "must" | "nice";
  /** null means no linked flashcard has been practiced yet — not knowing counts as a weak spot too. */
  averageConfidence: number | null;
  reviewedCardCount: number;
  totalLinkedCardCount: number;
}

/**
 * The creative feature: joins practice confidence back to job
 * *requirements* via the flashcards' requirement_ids, rather than just
 * ranking flashcards. Tells the user which requirements from the actual
 * posting they're weak on — the thing they'll be asked about in the
 * interview — reusing the id spine the kit already carries rather than
 * inventing a parallel tracking structure.
 */
export function computeWeakSpots(
  requirements: WeakSpotRequirement[],
  flashcards: WeakSpotFlashcard[],
  practiceState: Record<string, PracticeCardState>,
): WeakSpotEntry[] {
  const entries: WeakSpotEntry[] = requirements.map((r) => {
    const linkedCards = flashcards.filter((f) => f.requirement_ids.includes(r.id));
    const confidences = linkedCards
      .map((f) => practiceState[f.id]?.lastConfidence)
      .filter((c): c is number => c !== null && c !== undefined);

    const averageConfidence =
      confidences.length > 0 ? Math.round((confidences.reduce((sum, c) => sum + c, 0) / confidences.length) * 100) / 100 : null;

    return {
      requirementId: r.id,
      requirementText: r.text,
      priority: r.priority,
      averageConfidence,
      reviewedCardCount: confidences.length,
      totalLinkedCardCount: linkedCards.length,
    };
  });

  // Weakest first: never-practiced ranks below any practiced score, must-priority breaks ties.
  return entries.sort((a, b) => {
    const aScore = a.averageConfidence ?? -1;
    const bScore = b.averageConfidence ?? -1;
    if (aScore !== bScore) return aScore - bScore;
    if (a.priority !== b.priority) return a.priority === "must" ? -1 : 1;
    return 0;
  });
}
