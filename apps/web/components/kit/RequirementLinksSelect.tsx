import type { Requirement } from "@prep-kit/schema";

export function RequirementLinksSelect({
  requirements,
  selectedIds,
  onChange,
  label,
}: {
  requirements: Requirement[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  return (
    <select
      multiple
      aria-label={label}
      value={selectedIds}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      size={Math.min(4, Math.max(2, requirements.length))}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
    >
      {requirements.map((r) => (
        <option key={r.id} value={r.id}>
          {r.text}
        </option>
      ))}
    </select>
  );
}
