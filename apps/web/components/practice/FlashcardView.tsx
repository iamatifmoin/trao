import type { Flashcard } from "@prep-kit/schema";
import { Button } from "@/components/Button";

export function FlashcardView({
  flashcard,
  revealed,
  onReveal,
}: {
  flashcard: Flashcard;
  revealed: boolean;
  onReveal: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Front</p>
      <p className="mt-2 text-lg font-medium text-slate-900">{flashcard.front}</p>

      {revealed ? (
        <div className="mt-6 border-t border-slate-100 pt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Back</p>
          <p className="mt-2 text-base text-slate-700">{flashcard.back}</p>
        </div>
      ) : (
        <Button className="mt-6" onClick={onReveal} autoFocus>
          Reveal answer <span className="ml-1 text-xs opacity-70">(space)</span>
        </Button>
      )}
    </div>
  );
}
