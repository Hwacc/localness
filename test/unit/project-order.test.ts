import { describe, expect, it } from 'vitest'
import {
  applyProjectOrder,
  moveProjectInOrder,
} from '#shared/utils/project-order'

const p = (id: number) => ({ id, name: `p${id}` })

describe('applyProjectOrder', () => {
  it('returns a copy, so callers cannot alias the store array', () => {
    const items = [p(1), p(2)]
    expect(applyProjectOrder(items, undefined)).not.toBe(items)
    expect(applyProjectOrder(items, null)).not.toBe(items)
    expect(applyProjectOrder(items, [])).not.toBe(items)
  })

  it('leaves the list alone when nothing was ever ordered', () => {
    const items = [p(3), p(1), p(2)]
    expect(applyProjectOrder(items, undefined)).toEqual(items)
    expect(applyProjectOrder(items, [])).toEqual(items)
  })

  it('puts the named ids first, in the stored order', () => {
    expect(applyProjectOrder([p(1), p(2), p(3)], [3, 1, 2])).toEqual([
      p(3),
      p(1),
      p(2),
    ])
  })

  it('appends unnamed ids after the named ones, keeping their order', () => {
    // A project created after the order was saved, or one a teammate added.
    expect(applyProjectOrder([p(1), p(2), p(3)], [3])).toEqual([
      p(3),
      p(1),
      p(2),
    ])
    expect(applyProjectOrder([p(1), p(2), p(3)], [2])).toEqual([
      p(2),
      p(1),
      p(3),
    ])
  })

  it('sends a newly created project to the end', () => {
    // The headline case: the API hands back the newest first, the stored order
    // does not name it, so it falls to the back of its Team.
    expect(
      applyProjectOrder([p(4), p(1), p(2), p(3)], [1, 2, 3])
    ).toEqual([p(1), p(2), p(3), p(4)])
  })

  it('skips stored ids that are gone', () => {
    expect(applyProjectOrder([p(1), p(2)], ['gone', 2])).toEqual([p(2), p(1)])
    expect(applyProjectOrder([p(1), p(2)], ['a', 'b'])).toEqual([p(1), p(2)])
  })

  it('takes a stored id repeated twice only once', () => {
    expect(applyProjectOrder([p(1), p(2)], [2, 2, 1])).toEqual([p(2), p(1)])
  })

  it('keeps every card when the list repeats an id', () => {
    const items = [p(1), p(2), p(1)]
    expect(applyProjectOrder(items, [1])).toEqual([p(1), p(1), p(2)])
    expect(applyProjectOrder(items, undefined)).toEqual(items)
  })

  it('handles an empty list', () => {
    expect(applyProjectOrder([], [1, 2])).toEqual([])
  })

  it('compares ids by value, not by type', () => {
    // Storage holds strings; the store and the API hold numbers.
    expect(applyProjectOrder([p(1), p(2)], ['2'])).toEqual([p(2), p(1)])
    expect(applyProjectOrder([{ id: '2' }, p(1)], [2])).toEqual([
      { id: '2' },
      p(1),
    ])
  })

  it('does not mutate its inputs', () => {
    const items = [p(1), p(2), p(3)]
    const order = [3, 1, 2]
    const itemsBefore = structuredClone(items)
    const orderBefore = structuredClone(order)
    applyProjectOrder(items, order)
    expect(items).toEqual(itemsBefore)
    expect(order).toEqual(orderBefore)
  })
})

describe('moveProjectInOrder', () => {
  it('moves forward', () => {
    expect(moveProjectInOrder([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4])
  })

  it('moves backward', () => {
    expect(moveProjectInOrder([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3])
  })

  it('clamps an index past the ends', () => {
    expect(moveProjectInOrder([1, 2, 3], 1, 99)).toEqual([2, 3, 1])
    expect(moveProjectInOrder([1, 2, 3], 3, -5)).toEqual([3, 1, 2])
  })

  it('returns a copy when the id is unknown', () => {
    const ids = [1, 2, 3]
    const moved = moveProjectInOrder(ids, 9, 0)
    expect(moved).toEqual([1, 2, 3])
    expect(moved).not.toBe(ids)
  })

  it('is a no-op when the drop lands on its own slot', () => {
    expect(moveProjectInOrder([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
  })

  it('preserves the length and every id exactly once', () => {
    const ids = [1, 2, 3, 4, 5]
    const moved = moveProjectInOrder(ids, 3, 0)
    expect(moved).toHaveLength(ids.length)
    expect([...moved].sort()).toEqual([...ids].sort())
  })

  it('does not mutate the input', () => {
    const ids = [1, 2, 3]
    const before = [...ids]
    moveProjectInOrder(ids, 1, 2)
    expect(ids).toEqual(before)
  })
})
