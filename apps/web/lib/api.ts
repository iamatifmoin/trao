import { apiFetch, API_BASE_URL } from "./api-client";
import type { Kit } from "@prep-kit/schema";
import type { PracticeCardState, PracticeCoverage, WeakSpotEntry } from "@prep-kit/core";

export interface AuthUser {
  id: string;
  email: string;
}

export const authApi = {
  me: () => apiFetch<{ user: AuthUser | null }>("/api/auth/me"),
  register: (email: string, password: string) =>
    apiFetch<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    apiFetch<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
};

export type KitStatus = "pending" | "generating" | "ready" | "failed";

export interface ApiErrorShape {
  code: string;
  message: string;
}

export interface KitSummary {
  id: string;
  status: KitStatus;
  progress: { step: string };
  input: { jd: string; companyUrl: string; days: number };
  company: string | null;
  role: string | null;
  error: ApiErrorShape | null;
  createdAt: string;
  updatedAt: string;
}

export interface KitDetail {
  id: string;
  status: KitStatus;
  progress: { step: string };
  input: { jd: string; companyUrl: string; days: number };
  kit: Kit | null;
  warnings: string[];
  error: ApiErrorShape | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKitInput {
  jd: string;
  company_url: string;
  days: number;
}

export const kitsApi = {
  list: () => apiFetch<{ kits: KitSummary[] }>("/api/kits"),
  get: (id: string) => apiFetch<KitDetail>(`/api/kits/${id}`),
  create: (input: CreateKitInput) =>
    apiFetch<{ kit: KitSummary; duplicate: boolean }>("/api/kits", { method: "POST", body: JSON.stringify(input) }),
  createBatch: (cases: CreateKitInput[]) =>
    apiFetch<{ kits: { kit: KitSummary; duplicate: boolean }[] }>("/api/kits/batch", {
      method: "POST",
      body: JSON.stringify({ cases }),
    }),

  updateRequirement: (kitId: string, reqId: string, data: Partial<{ text: string; kind: string; priority: string }>) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/requirements/${reqId}`, { method: "PATCH", body: JSON.stringify(data) }),
  addRequirement: (kitId: string, data: { text: string; kind: string; priority: string }) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/requirements`, { method: "POST", body: JSON.stringify(data) }),
  deleteRequirement: (kitId: string, reqId: string) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/requirements/${reqId}`, { method: "DELETE" }),
  reorderRequirements: (kitId: string, orderedIds: string[]) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/requirements/reorder`, { method: "PATCH", body: JSON.stringify({ orderedIds }) }),

  updateQuestion: (
    kitId: string,
    qId: string,
    data: Partial<{ prompt: string; answer_outline: string; difficulty: number; requirement_ids: string[]; category: string; pinned: boolean }>,
  ) => apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/questions/${qId}`, { method: "PATCH", body: JSON.stringify(data) }),
  addQuestion: (
    kitId: string,
    data: { prompt: string; answer_outline: string; difficulty: number; requirement_ids: string[]; category: string },
  ) => apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/questions`, { method: "POST", body: JSON.stringify(data) }),
  deleteQuestion: (kitId: string, qId: string) => apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/questions/${qId}`, { method: "DELETE" }),
  reorderQuestions: (kitId: string, orderedIds: string[]) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/questions/reorder`, { method: "PATCH", body: JSON.stringify({ orderedIds }) }),

  updateFlashcard: (kitId: string, fId: string, data: Partial<{ front: string; back: string; requirement_ids: string[]; pinned: boolean }>) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${fId}`, { method: "PATCH", body: JSON.stringify(data) }),
  addFlashcard: (kitId: string, data: { front: string; back: string; requirement_ids: string[] }) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/flashcards`, { method: "POST", body: JSON.stringify(data) }),
  deleteFlashcard: (kitId: string, fId: string) => apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/${fId}`, { method: "DELETE" }),
  reorderFlashcards: (kitId: string, orderedIds: string[]) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/flashcards/reorder`, { method: "PATCH", body: JSON.stringify({ orderedIds }) }),

  updateCompanyBrief: (kitId: string, data: Partial<{ summary: string; what_they_do: string; pinned: boolean }>) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/company-brief`, { method: "PATCH", body: JSON.stringify(data) }),

  regenerateCompanyBrief: (kitId: string) => apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/company-brief`, { method: "POST" }),
  regenerateQuestions: (kitId: string, category: string) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/questions/${category}`, { method: "POST" }),
  regenerateSchedule: (kitId: string, days?: number) =>
    apiFetch<{ kit: Kit }>(`/api/kits/${kitId}/regenerate/schedule`, {
      method: "POST",
      body: JSON.stringify(days ? { days } : {}),
    }),
};

export interface PracticeCard {
  flashcard: Kit["flashcards"][number];
  state: PracticeCardState | null;
}

export const practiceApi = {
  session: (kitId: string) => apiFetch<{ cards: PracticeCard[]; coverage: PracticeCoverage }>(`/api/kits/${kitId}/practice/session`),
  review: (kitId: string, flashcardId: string, confidence: number) =>
    apiFetch<{ state: PracticeCardState }>(`/api/kits/${kitId}/practice/${flashcardId}/review`, {
      method: "POST",
      body: JSON.stringify({ confidence }),
    }),
  weakSpots: (kitId: string) => apiFetch<{ weakSpots: WeakSpotEntry[] }>(`/api/kits/${kitId}/practice/weak-spots`),
};

export function progressStreamUrl(kitId: string): string {
  return `${API_BASE_URL}/api/kits/${kitId}/stream`;
}
