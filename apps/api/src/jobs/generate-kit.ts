import { ObjectId } from "mongodb";
import { classifyBuildKitError, type BuildKitInput, type BuildKitResult } from "@prep-kit/core";
import { getDb } from "../db/mongo.js";
import type { KitDoc } from "../db/models.js";
import { publishProgress } from "../lib/progress-bus.js";

export type BuildKitFn = (input: BuildKitInput) => Promise<BuildKitResult>;

// Guards against the same kit being generated twice concurrently — e.g. a
// duplicate trigger from a retried request landing while the first run is
// still in flight (Section 13's "triggered twice" concern).
const activeGenerations = new Set<string>();

export async function runGeneration(kitId: ObjectId, buildKitFn: BuildKitFn): Promise<void> {
  const key = kitId.toString();
  if (activeGenerations.has(key)) return;
  activeGenerations.add(key);

  const kits = getDb().collection<KitDoc>("kits");

  try {
    const doc = await kits.findOne({ _id: kitId });
    if (!doc) return;

    await kits.updateOne(
      { _id: kitId },
      { $set: { status: "generating", progress: { step: "Starting" }, updatedAt: new Date() } },
    );
    publishProgress(key, { step: "Starting", status: "generating" });

    const { kit, warnings, research } = await buildKitFn({
      jd: doc.input.jd,
      companyUrl: doc.input.companyUrl,
      daysAvailable: doc.input.days,
      onProgress: (step: string) => {
        void kits.updateOne({ _id: kitId }, { $set: { progress: { step }, updatedAt: new Date() } });
        publishProgress(key, { step, status: "generating" });
      },
    });

    await kits.updateOne(
      { _id: kitId },
      {
        $set: {
          status: "ready",
          kit,
          research,
          warnings,
          error: null,
          progress: { step: "Done" },
          updatedAt: new Date(),
        },
      },
    );
    publishProgress(key, { step: "Done", status: "ready" });
  } catch (err) {
    const classified = classifyBuildKitError(err);
    await kits.updateOne(
      { _id: kitId },
      { $set: { status: "failed", error: classified, progress: { step: "Failed" }, updatedAt: new Date() } },
    );
    publishProgress(key, { step: "Failed", status: "failed", error: classified });
  } finally {
    activeGenerations.delete(key);
  }
}
