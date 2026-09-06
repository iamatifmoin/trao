import { EventEmitter } from "node:events";

export interface ProgressEvent {
  step: string;
  status: "generating" | "ready" | "failed";
  error?: { code: string; message: string };
}

// In-process pub/sub keyed by kit id — good enough for a single-instance
// deployment. SSE clients also get the current state on connect (read from
// Mongo), so a missed event just means a slightly stale read on reconnect,
// never a stuck UI.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishProgress(kitId: string, event: ProgressEvent): void {
  bus.emit(kitId, event);
}

export function subscribeProgress(kitId: string, listener: (event: ProgressEvent) => void): () => void {
  bus.on(kitId, listener);
  return () => bus.off(kitId, listener);
}
