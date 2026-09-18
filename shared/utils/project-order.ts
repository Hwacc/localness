import type { ID } from '../types'

/**
 * Puts `items` in the stored card order: ids named by `order` come first, in
 * that order; anything `order` does not name keeps its own relative order after
 * them. Ids in `order` that no longer exist are skipped, and an id repeated in
 * `order` is taken once. Always returns a new array.
 */
export function applyProjectOrder<T extends { id: ID }>(
  items: readonly T[],
  order: readonly ID[] | null | undefined
): T[] {
  if (!items.length) return []
  if (!order?.length) return [...items]

  // Buckets, not single items: a duplicate id in the list keeps every card.
  const pending = new Map<string, T[]>()
  for (const item of items) {
    const key = String(item.id)
    const bucket = pending.get(key)
    if (bucket) bucket.push(item)
    else pending.set(key, [item])
  }

  const ordered: T[] = []
  for (const orderId of order) {
    const key = String(orderId)
    const bucket = pending.get(key)
    if (!bucket) continue
    ordered.push(...bucket)
    pending.delete(key)
  }
  // Whatever is left is unnamed — a project created since the order was saved,
  // or one a teammate added. Map keeps insertion order, so they keep their
  // relative order and land after everything that was named.
  for (const bucket of pending.values()) ordered.push(...bucket)
  return ordered
}

/**
 * The new order after dragging `draggedId` to `toIndex`, counted in the array
 * as it will look once the drop lands. Returns a copy; an unknown `draggedId`
 * or a move onto its own slot leaves the contents unchanged.
 */
export function moveProjectInOrder(
  orderedIds: readonly ID[],
  draggedId: ID,
  toIndex: number
): ID[] {
  const next = [...orderedIds]
  const from = next.findIndex((id) => String(id) === String(draggedId))
  if (from < 0) return next
  const to = Math.max(0, Math.min(toIndex, next.length - 1))
  if (from === to) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
