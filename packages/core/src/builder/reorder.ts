interface HasId {
  id: string;
}

/**
 * Reorders items to match orderedIds. Anything not mentioned keeps its
 * relative order, appended at the end — defensive against a client sending
 * a partial list, though the normal case lists every id.
 */
export function applyReorder<T extends HasId>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      ordered.push(item);
      seen.add(id);
    }
  }

  const remaining = items.filter((item) => !seen.has(item.id));
  return [...ordered, ...remaining];
}
