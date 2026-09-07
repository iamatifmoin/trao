"use client";

import { useState } from "react";
import type { Kit, Question } from "@prep-kit/schema";
import { EditableField } from "./EditableField";
import { OriginBadge, PinButton, MoveButtons, DeleteButton } from "./ItemChrome";
import { RequirementLinksSelect } from "./RequirementLinksSelect";
import { Button } from "@/components/Button";
import { moveItem } from "@/lib/array-utils";
import type { useKitMutations } from "@/lib/use-kit-mutations";

const CATEGORIES: { value: Question["category"]; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "behavioural", label: "Behavioural" },
  { value: "system-design", label: "System design" },
  { value: "company-fit", label: "Company fit" },
];

const DIFFICULTY_LABELS: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

function reorderWithinCategory(all: Question[], category: string, index: number, direction: -1 | 1): Question[] {
  const inCategory = all.filter((q) => q.category === category);
  const reordered = moveItem(inCategory, index, direction);
  let cursor = 0;
  return all.map((q) => (q.category === category ? reordered[cursor++]! : q));
}

function QuestionRow({
  question,
  index,
  count,
  kit,
  mutations,
}: {
  question: Question;
  index: number;
  count: number;
  kit: Kit;
  mutations: ReturnType<typeof useKitMutations>;
}) {
  const pinned = question._meta?.pinned ?? false;

  return (
    <li className="flex items-start gap-2 border-t border-slate-100 py-3 first:border-t-0">
      <MoveButtons
        onUp={() => mutations.questionReorder.mutate(reorderWithinCategory(kit.questions, question.category, index, -1).map((q) => q.id))}
        onDown={() => mutations.questionReorder.mutate(reorderWithinCategory(kit.questions, question.category, index, 1).map((q) => q.id))}
        upLabel={`Move question up`}
        downLabel={`Move question down`}
        disableUp={index === 0}
        disableDown={index === count - 1}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <OriginBadge meta={question._meta} />
          <span className="text-xs text-slate-400">Difficulty:</span>
          <select
            aria-label="Difficulty"
            value={question.difficulty}
            onChange={(e) =>
              mutations.questionUpdate.mutate({ id: question.id, data: { difficulty: Number(e.target.value) } })
            }
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
          >
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
          <select
            aria-label="Category"
            value={question.category}
            onChange={(e) => mutations.questionUpdate.mutate({ id: question.id, data: { category: e.target.value } })}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <EditableField
          as="textarea"
          rows={2}
          label="Question prompt"
          value={question.prompt}
          onCommit={(prompt) => mutations.questionUpdate.mutate({ id: question.id, data: { prompt } })}
          className="font-medium"
        />
        <div>
          <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Answer outline</p>
          <EditableField
            as="textarea"
            rows={2}
            label="Answer outline"
            value={question.answer_outline}
            onCommit={(answer_outline) => mutations.questionUpdate.mutate({ id: question.id, data: { answer_outline } })}
          />
        </div>
        <div className="px-2">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Linked requirements</p>
          <RequirementLinksSelect
            requirements={kit.role.requirements}
            selectedIds={question.requirement_ids}
            onChange={(ids) => mutations.questionUpdate.mutate({ id: question.id, data: { requirement_ids: ids } })}
            label="Requirements this question covers"
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <PinButton pinned={pinned} onToggle={() => mutations.questionPinToggle.mutate({ id: question.id, pinned: !pinned })} label="question" />
        <DeleteButton onClick={() => mutations.questionDelete.mutate(question.id)} label="Delete question" />
      </div>
    </li>
  );
}

function CategorySection({
  category,
  label,
  kit,
  mutations,
}: {
  category: Question["category"];
  label: string;
  kit: Kit;
  mutations: ReturnType<typeof useKitMutations>;
}) {
  const questions = kit.questions.filter((q) => q.category === category);
  const [isAdding, setIsAdding] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const isRegenerating = mutations.questionRegenerateCategory.isPending;

  function handleAdd() {
    if (!newPrompt.trim()) return;
    mutations.questionAdd.mutate(
      { prompt: newPrompt.trim(), answer_outline: "", difficulty: 2, requirement_ids: [], category },
      { onSuccess: () => setNewPrompt("") },
    );
    setIsAdding(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          {label} <span className="font-normal text-slate-400">({questions.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsAdding(true)}>
            + Add
          </Button>
          <Button variant="secondary" onClick={() => mutations.questionRegenerateCategory.mutate(category)} disabled={isRegenerating}>
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      </div>

      {questions.length === 0 && !isAdding && <p className="py-3 text-sm text-slate-400">No questions in this category yet.</p>}

      <ul>
        {questions.map((q, i) => (
          <QuestionRow key={q.id} question={q} index={i} count={questions.length} kit={kit} mutations={mutations} />
        ))}
      </ul>

      {isAdding && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 p-2">
          <input
            autoFocus
            aria-label="New question prompt"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Write a question…"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <Button onClick={handleAdd}>Add</Button>
          <Button variant="ghost" onClick={() => setIsAdding(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export function QuestionBank({ kit, mutations }: { kit: Kit; mutations: ReturnType<typeof useKitMutations> }) {
  return (
    <section aria-labelledby="questions-heading" className="space-y-4">
      <h2 id="questions-heading" className="text-base font-semibold text-slate-900">
        Question bank
      </h2>
      {CATEGORIES.map((c) => (
        <CategorySection key={c.value} category={c.value} label={c.label} kit={kit} mutations={mutations} />
      ))}
    </section>
  );
}
