import type { Meta } from "@prep-kit/schema";

/** Edited, hand-written, or pinned — the three things that survive a regeneration of their own section (Section 6). */
export function isProtected(meta: Meta | undefined): boolean {
  return meta?.origin === "edited" || meta?.origin === "manual" || meta?.pinned === true;
}

/** First hand-edit flips generated → edited; a manual item stays manual. Revision always bumps so staleness is visible. */
export function markEdited(meta: Meta | undefined): Meta {
  return {
    origin: meta?.origin === "manual" ? "manual" : "edited",
    pinned: meta?.pinned ?? false,
    order: meta?.order ?? 0,
    revision: (meta?.revision ?? 0) + 1,
  };
}

/** Sets pinned without touching origin/revision — filling in sensible defaults if _meta was missing entirely, so a pin-only update never produces an incomplete _meta object. */
export function withPinned(meta: Meta | undefined, pinned: boolean): Meta {
  return {
    origin: meta?.origin ?? "generated",
    pinned,
    order: meta?.order ?? 0,
    revision: meta?.revision ?? 0,
  };
}

export function newManualMeta(order: number): Meta {
  return { origin: "manual", pinned: false, order, revision: 0 };
}

export function freshGeneratedMeta(order: number): Meta {
  return { origin: "generated", pinned: false, order, revision: 0 };
}
