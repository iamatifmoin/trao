export interface CoverageRequirementInput {
  id: string;
  priority: "must" | "nice";
}

export interface CoverageQuestionInput {
  requirement_ids: string[];
}

export interface CoverageResult {
  /** Every requirement (must or nice) with no question against it. Reported honestly in the final kit even if non-empty. */
  uncoveredRequirementIds: string[];
  /** The subset that actually drives the second-pass loop — Section 4 only demands closing must-have gaps. */
  uncoveredMustRequirementIds: string[];
}

/**
 * A pure set-difference: which requirements have zero questions referencing
 * their id. Section 3 reserves this comparison for code rather than the
 * model — coverage is checkable, not a matter of the model's opinion.
 */
export function checkCoverage(
  requirements: CoverageRequirementInput[],
  questions: CoverageQuestionInput[],
): CoverageResult {
  const covered = new Set(questions.flatMap((q) => q.requirement_ids));
  const uncovered = requirements.filter((r) => !covered.has(r.id));

  return {
    uncoveredRequirementIds: uncovered.map((r) => r.id),
    uncoveredMustRequirementIds: uncovered.filter((r) => r.priority === "must").map((r) => r.id),
  };
}
