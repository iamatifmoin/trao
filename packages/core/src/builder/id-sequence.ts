/**
 * Continues an existing "prefix+number" id sequence (r1, r2, …) rather than
 * restarting from 1 — needed whenever new items are added to a kit that
 * already has some (manual add, regeneration), so a new id can never
 * collide with a surviving one.
 */
export function createIdSequence(existingIds: string[], prefix: string): () => string {
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  let counter = max;
  return () => `${prefix}${++counter}`;
}
