export interface ScheduleQuestionInput {
  id: string;
  category: string;
  difficulty: 1 | 2 | 3;
  requirement_ids: string[];
}

export interface ScheduleRequirementInput {
  id: string;
  priority: "must" | "nice";
}

export interface AllocatedScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

const MIN_DAY_MINUTES = 30;
const MAX_DAY_MINUTES = 180;
const DIFFICULTY_MINUTES: Record<1 | 2 | 3, number> = { 1: 10, 2: 15, 3: 25 };

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical deep-dive",
  behavioural: "Behavioural prep",
  "system-design": "System design",
  "company-fit": "Company & culture fit",
};

function minutesFor(q: ScheduleQuestionInput): number {
  return DIFFICULTY_MINUTES[q.difficulty] ?? 15;
}

/** 0 = tests a must-have, 1 = tests only nice-to-haves, 2 = untied (e.g. company-fit). Lower sorts earlier. */
function priorityRank(q: ScheduleQuestionInput, priorityById: Map<string, "must" | "nice">): 0 | 1 | 2 {
  if (q.requirement_ids.length === 0) return 2;
  const priorities = q.requirement_ids.map((id) => priorityById.get(id)).filter(Boolean);
  if (priorities.includes("must")) return 0;
  if (priorities.length > 0) return 1;
  return 2;
}

function dominantCategoryLabel(bucket: ScheduleQuestionInput[]): string {
  if (bucket.length === 0) return "No material scheduled";
  const counts = new Map<string, number>();
  for (const q of bucket) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
  const [topCategory] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  return CATEGORY_LABELS[topCategory] ?? topCategory;
}

function focusFor(bucket: ScheduleQuestionInput[], minutes: number, suffix = ""): string {
  const base = `${dominantCategoryLabel(bucket)}${suffix}`;
  if (minutes > MAX_DAY_MINUTES) {
    return `${base} (longer than ideal for one day — consider spreading this over more days if you can)`;
  }
  return base;
}

/**
 * Deterministic allocation — Section 3 and Section 8 both reserve this for
 * code, not the model. Sorts by priority/difficulty so harder, must-linked
 * material lands on earlier days, then either bin-packs (enough material
 * for every day to get something new) or spaces reviews across the extra
 * days (fewer questions than days requested).
 */
export function allocateSchedule(
  questions: ScheduleQuestionInput[],
  requirements: ScheduleRequirementInput[],
  daysAvailable: number,
): AllocatedScheduleDay[] {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) {
    throw new Error(`daysAvailable must be a positive integer, got ${daysAvailable}`);
  }

  if (questions.length === 0) {
    return Array.from({ length: daysAvailable }, (_, i) => ({
      day: i + 1,
      focus: "No questions available yet",
      question_ids: [],
      minutes: 0,
    }));
  }

  const priorityById = new Map(requirements.map((r) => [r.id, r.priority] as const));
  const sorted = [...questions].sort((a, b) => {
    const rankDiff = priorityRank(a, priorityById) - priorityRank(b, priorityById);
    if (rankDiff !== 0) return rankDiff;
    return b.difficulty - a.difficulty;
  });

  if (sorted.length >= daysAvailable) {
    return packIntoExactDays(sorted, daysAvailable);
  }

  return spaceAcrossExtraDays(sorted, daysAvailable);
}

function packIntoExactDays(sorted: ScheduleQuestionInput[], daysAvailable: number): AllocatedScheduleDay[] {
  const totalMinutes = sorted.reduce((sum, q) => sum + minutesFor(q), 0);
  const perDayCap = Math.min(MAX_DAY_MINUTES, Math.max(MIN_DAY_MINUTES, Math.ceil(totalMinutes / daysAvailable)));

  const days: AllocatedScheduleDay[] = [];
  let i = 0;

  for (let d = 1; d <= daysAvailable; d++) {
    const isLastDay = d === daysAvailable;
    const remainingDaysAfterThis = daysAvailable - d;
    const remainingItemsAtStart = sorted.length - i;
    // Cap how much a greedy day can take so it can't starve a later day of
    // its own material — without this, a run of small items can all land
    // on one day and leave trailing days empty even though there was
    // enough material overall.
    const maxTake = isLastDay ? remainingItemsAtStart : Math.max(1, remainingItemsAtStart - remainingDaysAfterThis);

    const bucket: ScheduleQuestionInput[] = [];
    let minutes = 0;

    while (i < sorted.length && bucket.length < maxTake) {
      const q = sorted[i]!;
      const qMinutes = minutesFor(q);
      if (bucket.length > 0 && !isLastDay && minutes + qMinutes > perDayCap) break;
      bucket.push(q);
      minutes += qMinutes;
      i++;
    }

    days.push({ day: d, focus: focusFor(bucket, minutes), question_ids: bucket.map((q) => q.id), minutes });
  }

  return days;
}

function spaceAcrossExtraDays(sorted: ScheduleQuestionInput[], daysAvailable: number): AllocatedScheduleDay[] {
  const newDays: AllocatedScheduleDay[] = sorted.map((q, i) => {
    const minutes = minutesFor(q);
    return {
      day: i + 1,
      focus: focusFor([q], minutes, " — new material"),
      question_ids: [q.id],
      minutes,
    };
  });

  const reviewCount = daysAvailable - sorted.length;
  const reviewDays: AllocatedScheduleDay[] = [];

  for (let k = 0; k < reviewCount; k++) {
    const q = sorted[k % sorted.length]!;
    const minutes = Math.max(5, Math.round(minutesFor(q) / 2));
    reviewDays.push({
      day: sorted.length + k + 1,
      focus: focusFor([q], minutes, " — spaced review"),
      question_ids: [q.id],
      minutes,
    });
  }

  return [...newDays, ...reviewDays];
}
