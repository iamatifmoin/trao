/** Swaps an item with its neighbor in the given direction; a no-op at either end. Used by the up/down reorder controls. */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const copy = [...items];
  const moved = copy[index]!;
  copy.splice(index, 1);
  copy.splice(target, 0, moved);
  return copy;
}
