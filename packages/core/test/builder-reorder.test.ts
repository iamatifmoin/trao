import { describe, expect, it } from "vitest";
import { applyReorder } from "../src/builder/reorder.js";

describe("applyReorder", () => {
  it("reorders items to match the given id order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = applyReorder(items, ["c", "a", "b"]);
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("appends items not mentioned in orderedIds at the end, preserving their relative order", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = applyReorder(items, ["b"]);
    expect(result.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("ignores duplicate or unknown ids in orderedIds", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const result = applyReorder(items, ["b", "b", "ghost", "a"]);
    expect(result.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
