"use client";

import { useState } from "react";
import type { Kit } from "@prep-kit/schema";
import { EditableField } from "./EditableField";
import { OriginBadge, MoveButtons, DeleteButton } from "./ItemChrome";
import { Button } from "@/components/Button";
import { moveItem } from "@/lib/array-utils";
import type { useKitMutations } from "@/lib/use-kit-mutations";

const KIND_OPTIONS = ["technical", "behavioural", "domain"] as const;
const PRIORITY_OPTIONS = ["must", "nice"] as const;

export function RequirementsSection({ kit, mutations }: { kit: Kit; mutations: ReturnType<typeof useKitMutations> }) {
  const requirements = kit.role.requirements;
  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState("");

  function reorder(index: number, direction: -1 | 1) {
    const reordered = moveItem(requirements, index, direction);
    mutations.requirementReorder.mutate(reordered.map((r) => r.id));
  }

  function handleAdd() {
    if (!newText.trim()) return;
    mutations.requirementAdd.mutate(
      { text: newText.trim(), kind: "technical", priority: "nice" },
      { onSuccess: () => setNewText("") },
    );
    setIsAdding(false);
  }

  return (
    <section aria-labelledby="requirements-heading" className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="requirements-heading" className="text-base font-semibold text-slate-900">
          Role requirements
        </h2>
        <Button variant="secondary" onClick={() => setIsAdding(true)}>
          + Add requirement
        </Button>
      </div>

      {uncovered.size > 0 && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {uncovered.size} requirement{uncovered.size === 1 ? "" : "s"} have no question yet.
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {requirements.map((req, index) => (
          <li key={req.id} className="flex items-start gap-2 py-3">
            <MoveButtons
              onUp={() => reorder(index, -1)}
              onDown={() => reorder(index, 1)}
              upLabel={`Move "${req.text}" up`}
              downLabel={`Move "${req.text}" down`}
              disableUp={index === 0}
              disableDown={index === requirements.length - 1}
            />
            <div className="min-w-0 flex-1">
              <EditableField
                label={`Requirement text: ${req.text}`}
                value={req.text}
                onCommit={(text) => mutations.requirementUpdate.mutate({ id: req.id, data: { text } })}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
                <select
                  aria-label={`Kind for ${req.text}`}
                  value={req.kind}
                  onChange={(e) => mutations.requirementUpdate.mutate({ id: req.id, data: { kind: e.target.value } })}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Priority for ${req.text}`}
                  value={req.priority}
                  onChange={(e) => mutations.requirementUpdate.mutate({ id: req.id, data: { priority: e.target.value } })}
                  className={`rounded border px-1.5 py-0.5 text-xs ${
                    req.priority === "must" ? "border-brand-200 bg-brand-50 text-brand-700" : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p === "must" ? "must-have" : "nice-to-have"}
                    </option>
                  ))}
                </select>
                <OriginBadge meta={req._meta} />
                {uncovered.has(req.id) && <span className="text-xs text-amber-600">No question yet</span>}
              </div>
            </div>
            <DeleteButton onClick={() => mutations.requirementDelete.mutate(req.id)} label={`Delete requirement: ${req.text}`} />
          </li>
        ))}
      </ul>

      {isAdding && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 p-2">
          <input
            autoFocus
            aria-label="New requirement text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="e.g. 3+ years with Kubernetes"
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
