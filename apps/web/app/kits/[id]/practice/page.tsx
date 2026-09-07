"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { practiceApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Nav } from "@/components/Nav";
import { PageSpinner } from "@/components/Spinner";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Button } from "@/components/Button";
import { FlashcardView } from "@/components/practice/FlashcardView";
import { ConfidenceButtons } from "@/components/practice/ConfidenceButtons";
import { WeakSpotsPanel } from "@/components/practice/WeakSpotsPanel";

function PracticeSession({ kitId }: { kitId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["practice", kitId, "session"],
    queryFn: () => practiceApi.session(kitId),
  });

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const reviewMutation = useMutation({
    mutationFn: (vars: { flashcardId: string; confidence: number }) => practiceApi.review(kitId, vars.flashcardId, vars.confidence),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["practice", kitId, "weak-spots"] }),
  });

  const cards = data?.cards ?? [];
  const current = cards[index];

  // Keyboard: space/enter reveals; 1-5 rates confidence once revealed. Section 12 requires keyboard navigability throughout.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!current) return;
      if (!revealed && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && ["1", "2", "3", "4", "5"].includes(e.key)) {
        handleConfidence(Number(e.key));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, revealed]);

  function handleConfidence(confidence: number) {
    if (!current) return;
    reviewMutation.mutate({ flashcardId: current.flashcard.id, confidence });
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  function restart() {
    setIndex(0);
    setRevealed(false);
    void refetch();
  }

  if (isLoading) return <PageSpinner label="Loading practice session…" />;
  if (error) return <ErrorBanner message={error instanceof ApiError ? error.message : "Could not load practice session."} />;

  if (cards.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">This kit has no flashcards yet.</p>;
  }

  const coverage = data!.coverage;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {coverage.reviewedCards} / {coverage.totalCards} reviewed · {coverage.dueCardIds.length} due now
        </span>
        {index < cards.length && <span>{index + 1} of {cards.length}</span>}
      </div>

      {current ? (
        <>
          <FlashcardView flashcard={current.flashcard} revealed={revealed} onReveal={() => setRevealed(true)} />
          {revealed && <ConfidenceButtons onSelect={handleConfidence} disabled={reviewMutation.isPending} />}
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-base font-medium text-slate-800">Session complete</p>
          <p className="mt-1 text-sm text-slate-500">Nice work. You can go again — the next session will reflect what you just rated.</p>
          <Button className="mt-4" onClick={restart}>
            Practice again
          </Button>
        </div>
      )}

      <WeakSpotsPanel kitId={kitId} />
    </div>
  );
}

export default function PracticePage() {
  const params = useParams<{ id: string }>();

  return (
    <ProtectedRoute>
      <Nav />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Practice</h1>
          <Link href={`/kits/${params.id}`} className="text-sm text-brand-600 hover:underline">
            Back to kit
          </Link>
        </div>
        <PracticeSession kitId={params.id} />
      </main>
    </ProtectedRoute>
  );
}
