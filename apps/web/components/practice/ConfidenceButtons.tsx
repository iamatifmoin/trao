const LEVELS: { value: number; label: string }[] = [
  { value: 1, label: "No idea" },
  { value: 2, label: "Shaky" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Confident" },
  { value: 5, label: "Knew it cold" },
];

export function ConfidenceButtons({ onSelect, disabled }: { onSelect: (confidence: number) => void; disabled?: boolean }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-center text-xs text-slate-500">How confident did you feel?</p>
      <div className="grid grid-cols-5 gap-2">
        {LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(level.value)}
            aria-label={`Confidence ${level.value}: ${level.label} (press ${level.value})`}
            className="flex flex-col items-center gap-1 rounded-md border border-slate-200 px-2 py-2 text-xs text-slate-600 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
          >
            <span className="text-base font-semibold text-slate-800">{level.value}</span>
            <span>{level.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
