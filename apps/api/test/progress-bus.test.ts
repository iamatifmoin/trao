import { describe, expect, it, vi } from "vitest";
import { publishProgress, subscribeProgress } from "../src/lib/progress-bus.js";

describe("progress bus", () => {
  it("delivers a published event to a subscriber of the same kit id", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProgress("kit-1", listener);

    publishProgress("kit-1", { step: "Crawling", status: "generating" });
    expect(listener).toHaveBeenCalledWith({ step: "Crawling", status: "generating" });

    unsubscribe();
  });

  it("does not deliver events published for a different kit id", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProgress("kit-a", listener);

    publishProgress("kit-b", { step: "Crawling", status: "generating" });
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("stops delivering events after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeProgress("kit-2", listener);
    unsubscribe();

    publishProgress("kit-2", { step: "Done", status: "ready" });
    expect(listener).not.toHaveBeenCalled();
  });
});
