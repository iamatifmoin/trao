"use client";

import { useState } from "react";
import type { Kit } from "@prep-kit/schema";
import { EditableField } from "./EditableField";
import { OriginBadge, MoveButtons, DeleteButton } from "./ItemChrome";
import { RequirementLinksSelect } from "./RequirementLinksSelect";
import { Button } from "@/components/Button";
import { moveItem } from "@/lib/array-utils";
import type { useKitMutations } from "@/lib/use-kit-mutations";

export function FlashcardsSection({ kit, mutations }: { kit: Kit; mutations: ReturnType<typeof useKitMutations> }) {
  const flashcards = kit.flashcards;
  const [isAdding, setIsAdding] = useState(false);
  const [front, setFront] = useState("");

  function reorder(index: number, direction: -1 | 1) {
    const reordered = moveItem(flashcards, index, direction);
    mutations.flashcardReorder.mutate(reordered.map((f) => f.id));
  }

  function handleAdd() {
    if (!front.trim()) return;
    mutations.flashcardAdd.mutate({ front: front.trim(), back: "", requirement_ids: [] }, { onSuccess: () => setFront("") });
    setIsAdding(false);
  }

  return (
    <section aria-labelledby="flashcards-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="flashcards-heading" className="text-base font-semibold text-slate-900">
          Flashcards <span className="font-normal text-slate-400">({flashcards.length})</span>
        </h2>
        <Button variant="secondary" onClick={() => setIsAdding(true)}>
          + Add
        </Button>
      </div>

      <ul>
        {flashcards.map((card, index) => (
          <li key={card.id} className="flex items-start gap-2 border-t border-slate-100 py-3 first:border-t-0">
            <MoveButtons
              onUp={() => reorder(index, -1)}
              onDown={() => reorder(index, 1)}
              upLabel="Move flashcard up"
              downLabel="Move flashcard down"
              disableUp={index === 0}
              disableDown={index === flashcards.length - 1}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Front</p>
                <OriginBadge meta={card._meta} />
              </div>
              <EditableField
                label="Flashcard front"
                value={card.front}
                onCommit={(value) => mutations.flashcardUpdate.mutate({ id: card.id, data: { front: value } })}
                className="font-medium"
              />
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Back</p>
              <EditableField
                as="textarea"
                rows={2}
                label="Flashcard back"
                value={card.back}
                onCommit={(value) => mutations.flashcardUpdate.mutate({ id: card.id, data: { back: value } })}
              />
              <RequirementLinksSelect
                requirements={kit.role.requirements}
                selectedIds={card.requirement_ids}
                onChange={(ids) => mutations.flashcardUpdate.mutate({ id: card.id, data: { requirement_ids: ids } })}
                label="Requirements this flashcard covers"
              />
            </div>
            <DeleteButton onClick={() => mutations.flashcardDelete.mutate(card.id)} label="Delete flashcard" />
          </li>
        ))}
      </ul>

      {flashcards.length === 0 && !isAdding && <p className="py-3 text-sm text-slate-400">No flashcards yet.</p>}

      {isAdding && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 p-2">
          <input
            autoFocus
            aria-label="New flashcard front"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Front of the card…"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <Button onClick={handleAdd}>Add</Button>
          <Button variant="ghost" onClick={() => setIsAdding(false)}>
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
