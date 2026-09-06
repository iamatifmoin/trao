import type { ObjectId } from "mongodb";
import type { Kit } from "@prep-kit/schema";
import type { BuildKitResearch, PracticeCardState } from "@prep-kit/core";

export interface UserDoc {
  _id?: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export type KitStatus = "pending" | "generating" | "ready" | "failed";

export interface KitDoc {
  _id?: ObjectId;
  userId: ObjectId;
  status: KitStatus;
  progress: { step: string };
  input: { jd: string; companyUrl: string; days: number };
  kit: Kit | null;
  /** Exactly what fed the original generation — persisted so regenerating the brief or a question category reuses it instead of re-crawling the company site. Null until generation succeeds. */
  research: BuildKitResearch | null;
  /** Non-fatal issues surfaced from the pipeline (unreachable pages, no hiring page found, unclosed coverage gaps) — not part of the Appendix A kit shape itself, so they live on the wrapper document instead. */
  warnings: string[];
  error: { code: string; message: string } | null;
  /** Hash of userId+jd+companyUrl — the unique index on this is what makes duplicate submission detectable (Section 10). */
  dedupeKey: string;
  /** Keyed by flashcard id. SM-2 review state, kept alongside the kit rather than in a separate collection since it's owned 1:1 by it. */
  practice: Record<string, PracticeCardState>;
  createdAt: Date;
  updatedAt: Date;
}
