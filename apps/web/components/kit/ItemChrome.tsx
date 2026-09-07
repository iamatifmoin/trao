import type { Meta } from "@prep-kit/schema";

const ORIGIN_LABELS: Record<string, string> = {
  edited: "Edited",
  manual: "Added by you",
};

/** Only shown for edited/manual — a plain generated item stays visually quiet. */
export function OriginBadge({ meta }: { meta?: Meta }) {
  if (!meta?.origin || meta.origin === "generated") return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
      {ORIGIN_LABELS[meta.origin] ?? meta.origin}
    </span>
  );
}

export function PinButton({ pinned, onToggle, label }: { pinned: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label} so it survives regeneration`}
      title={pinned ? "Pinned — protected from regeneration" : "Pin to protect from regeneration"}
      className={`rounded-md p-1 text-sm transition-colors ${pinned ? "text-brand-600" : "text-slate-300 hover:text-slate-500"}`}
    >
      {pinned ? "📌" : "📍"}
    </button>
  );
}

export function MoveButtons({
  onUp,
  onDown,
  upLabel,
  downLabel,
  disableUp,
  disableDown,
}: {
  onUp: () => void;
  onDown: () => void;
  upLabel: string;
  downLabel: string;
  disableUp?: boolean;
  disableDown?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={disableUp}
        aria-label={upLabel}
        className="rounded px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20"
      >
        ▲
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disableDown}
        aria-label={downLabel}
        className="rounded px-1 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-20"
      >
        ▼
      </button>
    </div>
  );
}

export function DeleteButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1 text-sm text-slate-300 hover:text-red-500"
    >
      ✕
    </button>
  );
}
