import { describe, expect, it } from "vitest";
import { checkCoverage } from "../src/deterministic/coverage.js";

describe("checkCoverage", () => {
  it("reports nothing uncovered when every requirement has a question", () => {
    const result = checkCoverage(
      [
        { id: "r1", priority: "must" },
        { id: "r2", priority: "nice" },
      ],
      [{ requirement_ids: ["r1"] }, { requirement_ids: ["r2"] }],
    );
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.uncoveredMustRequirementIds).toEqual([]);
  });

  it("finds a must-have requirement with no question against it", () => {
    const result = checkCoverage(
      [
        { id: "r1", priority: "must" },
        { id: "r2", priority: "nice" },
      ],
      [{ requirement_ids: ["r2"] }],
    );
    expect(result.uncoveredRequirementIds).toEqual(["r1"]);
    expect(result.uncoveredMustRequirementIds).toEqual(["r1"]);
  });

  it("reports a nice-to-have gap without putting it in the must-only list", () => {
    const result = checkCoverage(
      [
        { id: "r1", priority: "must" },
        { id: "r2", priority: "nice" },
      ],
      [{ requirement_ids: ["r1"] }],
    );
    expect(result.uncoveredRequirementIds).toEqual(["r2"]);
    expect(result.uncoveredMustRequirementIds).toEqual([]);
  });

  it("treats every requirement as uncovered when there are no questions at all", () => {
    const result = checkCoverage([{ id: "r1", priority: "must" }], []);
    expect(result.uncoveredRequirementIds).toEqual(["r1"]);
  });

  it("a question can cover more than one requirement at once", () => {
    const result = checkCoverage(
      [
        { id: "r1", priority: "must" },
        { id: "r2", priority: "must" },
      ],
      [{ requirement_ids: ["r1", "r2"] }],
    );
    expect(result.uncoveredRequirementIds).toEqual([]);
  });
});
