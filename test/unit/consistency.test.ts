import { describe, expect, it } from 'vitest'
import {
  buildConsistencyGroups,
  type ConsistencyMember,
} from '#shared/utils/consistency'

let nextId = 1
function member(key: string, sourceText: string): ConsistencyMember {
  return { keyId: nextId++, key, sourceText, tagCount: 1 }
}

describe('buildConsistencyGroups', () => {
  it('groups two keys holding the same sentence as exact', () => {
    const groups = buildConsistencyGroups([
      member('a.save', 'Save'),
      member('b.save', 'Save'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.severity).toBe('exact')
    expect(groups[0]!.members.map((m) => m.key)).toEqual(['a.save', 'b.save'])
  })

  it('treats whitespace-only differences as exact', () => {
    const groups = buildConsistencyGroups([
      member('a.signin', 'Sign in'),
      member('b.signin', 'Sign\n  in'),
    ])
    expect(groups[0]!.severity).toBe('exact')
  })

  it('treats case differences as near', () => {
    const groups = buildConsistencyGroups([
      member('a.save', 'Save'),
      member('b.save', 'save'),
    ])
    expect(groups[0]!.severity).toBe('near')
  })

  it('treats punctuation differences as near, including CJK', () => {
    const groups = buildConsistencyGroups([
      member('a.ok', 'OK'),
      member('b.ok', 'ok.'),
      member('a.done', '完成'),
      member('b.done', '完成。'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.every((g) => g.severity === 'near')).toBe(true)
  })

  it('keeps symbols: C++ and C must not merge', () => {
    const groups = buildConsistencyGroups([
      member('a.title', 'C++'),
      member('b.title', 'C'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('finds nothing for different sentences', () => {
    const groups = buildConsistencyGroups([
      member('a.save', 'Save'),
      member('b.cancel', 'Cancel'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('skips empty and fully-punctuation source texts', () => {
    const groups = buildConsistencyGroups([
      member('a.blank', ''),
      member('b.blank', '   '),
      member('a.punct', '!!!'),
      member('b.punct', '???'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('drops single-member buckets', () => {
    const groups = buildConsistencyGroups([
      member('a.only', 'Save'),
      member('b.other', 'Cancel'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('reports one severity per group — the worst pair wins', () => {
    const groups = buildConsistencyGroups([
      member('a.cancel', 'Cancel'),
      member('b.cancel', 'cancel'),
      member('c.cancel', 'Cancel!'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.severity).toBe('near')
    expect(groups[0]!.members).toHaveLength(3)
  })

  it('sorts exact groups first, then by member count', () => {
    const groups = buildConsistencyGroups([
      member('a.a', 'Alpha'),
      member('b.a', 'alpha'),
      member('a.b', 'Same'),
      member('b.b', 'Same'),
      member('c.b', 'Same'),
    ])
    expect(groups[0]!.severity).toBe('exact')
    expect(groups[0]!.members).toHaveLength(3)
    expect(groups[1]!.severity).toBe('near')
  })

  it('gives a stable id for the same normalized text', () => {
    const first = buildConsistencyGroups([
      member('a.save', 'Save'),
      member('b.save', 'Save'),
    ])
    const second = buildConsistencyGroups([
      member('c.save', 'save!'),
      member('d.save', 'SAVE'),
    ])
    expect(first[0]!.id).toBe(second[0]!.id)
  })
})
