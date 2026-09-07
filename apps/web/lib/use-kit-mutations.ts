"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Kit } from "@prep-kit/schema";
import { kitsApi, type KitDetail } from "./api";

function setKit(queryClient: QueryClient, kitId: string, kit: Kit) {
  queryClient.setQueryData<KitDetail>(["kit", kitId], (prev) => (prev ? { ...prev, kit } : prev));
}

/** Applies a local edit immediately (for reorder/pin, where we know exactly what changed) and returns the previous kit so an error handler can roll back. */
function patchKit(queryClient: QueryClient, kitId: string, producer: (kit: Kit) => Kit): Kit | undefined {
  let previous: Kit | undefined;
  queryClient.setQueryData<KitDetail>(["kit", kitId], (prev) => {
    if (!prev?.kit) return prev;
    previous = prev.kit;
    return { ...prev, kit: producer(prev.kit) };
  });
  return previous;
}

function restoreKit(queryClient: QueryClient, kitId: string, kit: Kit | undefined) {
  if (kit) setKit(queryClient, kitId, kit);
}

function reorderById<T extends { id: string }>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return orderedIds.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

/**
 * One mutation per endpoint. Text-content edits rely on the server response
 * alone (the field already feels immediate because it's local component
 * state until blur — see EditableField); reorder and pin toggles patch the
 * cache optimistically since we know exactly what changed and users expect
 * a toggle/drag to respond instantly.
 */
export function useKitMutations(kitId: string) {
  const queryClient = useQueryClient();
  const onSuccessSetKit = ({ kit }: { kit: Kit }) => setKit(queryClient, kitId, kit);

  const requirementUpdate = useMutation({
    mutationFn: (vars: { id: string; data: Partial<{ text: string; kind: string; priority: string }> }) =>
      kitsApi.updateRequirement(kitId, vars.id, vars.data),
    onSuccess: onSuccessSetKit,
  });

  const requirementAdd = useMutation({
    mutationFn: (data: { text: string; kind: string; priority: string }) => kitsApi.addRequirement(kitId, data),
    onSuccess: onSuccessSetKit,
  });

  const requirementDelete = useMutation({
    mutationFn: (id: string) => kitsApi.deleteRequirement(kitId, id),
    onMutate: (id) =>
      patchKit(queryClient, kitId, (kit) => ({
        ...kit,
        role: { ...kit.role, requirements: kit.role.requirements.filter((r) => r.id !== id) },
      })),
    onError: (_err, _id, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const requirementReorder = useMutation({
    mutationFn: (orderedIds: string[]) => kitsApi.reorderRequirements(kitId, orderedIds),
    onMutate: (orderedIds) =>
      patchKit(queryClient, kitId, (kit) => ({
        ...kit,
        role: { ...kit.role, requirements: reorderById(kit.role.requirements, orderedIds) },
      })),
    onError: (_err, _vars, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const questionUpdate = useMutation({
    mutationFn: (vars: {
      id: string;
      data: Partial<{ prompt: string; answer_outline: string; difficulty: number; requirement_ids: string[]; category: string }>;
    }) => kitsApi.updateQuestion(kitId, vars.id, vars.data),
    onSuccess: onSuccessSetKit,
  });

  const questionPinToggle = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) => kitsApi.updateQuestion(kitId, vars.id, { pinned: vars.pinned }),
    onMutate: (vars) =>
      patchKit(queryClient, kitId, (kit) => ({
        ...kit,
        questions: kit.questions.map((q) => (q.id === vars.id ? { ...q, _meta: { ...q._meta, pinned: vars.pinned } } : q)),
      })),
    onError: (_err, _vars, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const questionAdd = useMutation({
    mutationFn: (data: { prompt: string; answer_outline: string; difficulty: number; requirement_ids: string[]; category: string }) =>
      kitsApi.addQuestion(kitId, data),
    onSuccess: onSuccessSetKit,
  });

  const questionDelete = useMutation({
    mutationFn: (id: string) => kitsApi.deleteQuestion(kitId, id),
    onMutate: (id) => patchKit(queryClient, kitId, (kit) => ({ ...kit, questions: kit.questions.filter((q) => q.id !== id) })),
    onError: (_err, _id, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const questionReorder = useMutation({
    mutationFn: (orderedIds: string[]) => kitsApi.reorderQuestions(kitId, orderedIds),
    onMutate: (orderedIds) => patchKit(queryClient, kitId, (kit) => ({ ...kit, questions: reorderById(kit.questions, orderedIds) })),
    onError: (_err, _vars, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const questionRegenerateCategory = useMutation({
    mutationFn: (category: string) => kitsApi.regenerateQuestions(kitId, category),
    onSuccess: onSuccessSetKit,
  });

  const flashcardUpdate = useMutation({
    mutationFn: (vars: { id: string; data: Partial<{ front: string; back: string; requirement_ids: string[] }> }) =>
      kitsApi.updateFlashcard(kitId, vars.id, vars.data),
    onSuccess: onSuccessSetKit,
  });

  const flashcardAdd = useMutation({
    mutationFn: (data: { front: string; back: string; requirement_ids: string[] }) => kitsApi.addFlashcard(kitId, data),
    onSuccess: onSuccessSetKit,
  });

  const flashcardDelete = useMutation({
    mutationFn: (id: string) => kitsApi.deleteFlashcard(kitId, id),
    onMutate: (id) => patchKit(queryClient, kitId, (kit) => ({ ...kit, flashcards: kit.flashcards.filter((f) => f.id !== id) })),
    onError: (_err, _id, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const flashcardReorder = useMutation({
    mutationFn: (orderedIds: string[]) => kitsApi.reorderFlashcards(kitId, orderedIds),
    onMutate: (orderedIds) => patchKit(queryClient, kitId, (kit) => ({ ...kit, flashcards: reorderById(kit.flashcards, orderedIds) })),
    onError: (_err, _vars, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const companyBriefUpdate = useMutation({
    mutationFn: (data: Partial<{ summary: string; what_they_do: string }>) => kitsApi.updateCompanyBrief(kitId, data),
    onSuccess: onSuccessSetKit,
  });

  const companyBriefPinToggle = useMutation({
    mutationFn: (pinned: boolean) => kitsApi.updateCompanyBrief(kitId, { pinned }),
    onMutate: (pinned) =>
      patchKit(queryClient, kitId, (kit) => ({
        ...kit,
        company_brief: { ...kit.company_brief, _meta: { ...kit.company_brief._meta, pinned } },
      })),
    onError: (_err, _vars, previous) => restoreKit(queryClient, kitId, previous),
    onSuccess: onSuccessSetKit,
  });

  const companyBriefRegenerate = useMutation({
    mutationFn: () => kitsApi.regenerateCompanyBrief(kitId),
    onSuccess: onSuccessSetKit,
  });

  const scheduleRegenerate = useMutation({
    mutationFn: (days?: number) => kitsApi.regenerateSchedule(kitId, days),
    onSuccess: onSuccessSetKit,
  });

  return {
    requirementUpdate,
    requirementAdd,
    requirementDelete,
    requirementReorder,
    questionUpdate,
    questionPinToggle,
    questionAdd,
    questionDelete,
    questionReorder,
    questionRegenerateCategory,
    flashcardUpdate,
    flashcardAdd,
    flashcardDelete,
    flashcardReorder,
    companyBriefUpdate,
    companyBriefPinToggle,
    companyBriefRegenerate,
    scheduleRegenerate,
  };
}
