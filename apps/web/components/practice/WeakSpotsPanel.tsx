import { useQuery } from "@tanstack/react-query";
import { practiceApi } from "@/lib/api";

const PRIORITY_STYLE: Record<string, string> = {
  must: "bg-red-50 text-red-700",
  nice: "bg-slate-100 text-slate-500",
};

/** The creative feature: which job requirements (not just which cards) you're actually weak on. */
export function WeakSpotsPanel({ kitId }: { kitId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["practice", kitId, "weak-spots"],
    queryFn: () => practiceApi.weakSpots(kitId),
  });

  if (isLoading || !data) return null;
  const spots = data.weakSpots;
  if (spots.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Weak spots</h2>
      <p className="mt-0.5 text-xs text-slate-400">
        Requirements ranked by how shaky your practice confidence has been — not yet practiced counts as weakest.
      </p>
      <ul className="mt-3 space-y-2">
        {spots.slice(0, 8).map((spot) => (
          <li key={spot.requirementId} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700">{spot.requirementText}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[spot.priority]}`}>
                {spot.priority === "must" ? "must-have" : "nice-to-have"}
              </span>
              <span className="w-24 text-right text-xs text-slate-400">
                {spot.averageConfidence === null ? "Not practiced" : `Confidence ${spot.averageConfidence}/5`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
