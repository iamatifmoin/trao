import { describe, expect, it } from "vitest";
import { createIdSequence } from "../src/builder/id-sequence.js";

describe("createIdSequence", () => {
  it("continues after the highest existing numeric suffix", () => {
    const next = createIdSequence(["q1", "q2", "q5"], "q");
    expect(next()).toBe("q6");
    expect(next()).toBe("q7");
  });

  it("starts at 1 when there are no existing ids with that prefix", () => {
    const next = createIdSequence(["r1", "r2"], "q");
    expect(next()).toBe("q1");
  });

  it("ignores ids with a different prefix", () => {
    const next = createIdSequence(["q1", "r99", "f42"], "q");
    expect(next()).toBe("q2");
  });
});
