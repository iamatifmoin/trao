import { describe, expect, it } from "vitest";
import { isProtected, markEdited, newManualMeta, freshGeneratedMeta } from "../src/builder/item-state.js";

describe("isProtected", () => {
  it("protects edited, manual, and pinned items", () => {
    expect(isProtected({ origin: "edited" })).toBe(true);
    expect(isProtected({ origin: "manual" })).toBe(true);
    expect(isProtected({ origin: "generated", pinned: true })).toBe(true);
  });

  it("does not protect a plain generated, unpinned item", () => {
    expect(isProtected({ origin: "generated", pinned: false })).toBe(false);
    expect(isProtected(undefined)).toBe(false);
  });
});

describe("markEdited", () => {
  it("flips a generated item to edited", () => {
    const meta = markEdited({ origin: "generated", pinned: false, order: 2, revision: 0 });
    expect(meta.origin).toBe("edited");
    expect(meta.revision).toBe(1);
  });

  it("keeps a manual item manual after further edits", () => {
    const meta = markEdited({ origin: "manual", pinned: false, order: 0, revision: 3 });
    expect(meta.origin).toBe("manual");
    expect(meta.revision).toBe(4);
  });

  it("preserves the pinned flag across an edit", () => {
    const meta = markEdited({ origin: "generated", pinned: true, order: 0, revision: 0 });
    expect(meta.pinned).toBe(true);
  });
});

describe("newManualMeta / freshGeneratedMeta", () => {
  it("creates a manual item with revision 0 and not pinned", () => {
    const meta = newManualMeta(3);
    expect(meta).toEqual({ origin: "manual", pinned: false, order: 3, revision: 0 });
  });

  it("creates a generated item with revision 0 and not pinned", () => {
    const meta = freshGeneratedMeta(1);
    expect(meta).toEqual({ origin: "generated", pinned: false, order: 1, revision: 0 });
  });
});
