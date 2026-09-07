"use client";

import { useState } from "react";
import type { Kit } from "@prep-kit/schema";
import { Button } from "@/components/Button";
import type { useKitMutations } from "@/lib/use-kit-mutations";

export function ScheduleSection({ kit, mutations }: { kit: Kit; mutations: ReturnType<typeof useKitMutations> }) {
  const [days, setDays] = useState(kit.schedule.days_available);
  const questionsById = new Map(kit.questions.map((q) => [q.id, q]));
  const isRegenerating = mutations.scheduleRegenerate.isPending;

  return (
    <section aria-labelledby="schedule-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="schedule-heading" className="text-base font-semibold text-slate-900">
          Study schedule
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="schedule-days" className="text-xs text-slate-500">
            Days
          </label>
          <input
            id="schedule-days"
            type="number"
            min={1}
            max={90}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <Button variant="secondary" onClick={() => mutations.scheduleRegenerate.mutate(days)} disabled={isRegenerating}>
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      <ol className="space-y-3">
        {kit.schedule.days.map((day) => (
          <li key={day.day} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-slate-800">
                Day {day.day} — {day.focus}
              </p>
              <p className="text-xs text-slate-400">{day.minutes} min</p>
            </div>
            {day.question_ids.length > 0 ? (
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-slate-600">
                {day.question_ids.map((qId) => (
                  <li key={qId} className="truncate">
                    {questionsById.get(qId)?.prompt ?? qId}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-xs text-slate-400">No material scheduled for this day.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
