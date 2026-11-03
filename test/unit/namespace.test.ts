import { describe, expect, it } from 'vitest'
import {
  countByNamespace,
  firstSegment,
  namespaceNameRejectReason,
  namespaceOf,
  namespaceSuggestions,
  prefixNamespace,
  resolveNamespaceFilterValue,
} from '#shared/utils/namespace'

describe('namespaceOf', () => {
  it('matches a declared name followed by any boundary', () => {
    expect(namespaceOf('s2w_hardware_ship_term_3', ['s2w'])).toBe('s2w')
    expect(namespaceOf('s2w.hardware.title', ['s2w'])).toBe('s2w')
    expect(namespaceOf('s2w-x', ['s2w'])).toBe('s2w')
    expect(namespaceOf('s2w:x', ['s2w'])).toBe('s2w')
    expect(namespaceOf('s2w/x', ['s2w'])).toBe('s2w')
  })

  it('never invents a group from an undeclared first segment', () => {
    expect(namespaceOf('hour_ago', ['s2w'])).toBeNull()
  })

  it('needs a boundary right after the name', () => {
    expect(namespaceOf('s2wx_title', ['s2w'])).toBeNull()
    expect(namespaceOf('s2w', ['s2w'])).toBeNull()
  })

  it('is case-sensitive, like keys', () => {
    expect(namespaceOf('S2W_title', ['s2w'])).toBeNull()
  })

  it('treats regex and LIKE wildcards literally', () => {
    expect(namespaceOf('a%b_x', ['a%b'])).toBe('a%b')
    expect(namespaceOf('axb_x', ['a_b'])).toBeNull()
  })

  it('prefers the longest name', () => {
    expect(namespaceOf('s2w_hw_title', ['s2w', 's2w_hw'])).toBe('s2w_hw')
  })
})

describe('firstSegment', () => {
  it('stops at the first boundary of any kind', () => {
    expect(firstSegment('s2w.hw_title')).toBe('s2w')
    expect(firstSegment('plain')).toBe('plain')
    expect(firstSegment('__draft_1')).toBe('')
  })
})

describe('namespaceNameRejectReason', () => {
  it('accepts a plain or joined name', () => {
    expect(namespaceNameRejectReason({ name: ' s2w ', takenNames: [] })).toBeNull()
    expect(namespaceNameRejectReason({ name: 'a.b', takenNames: [] })).toBeNull()
  })

  it('rejects empty, spaced, or separator-edged names', () => {
    expect(namespaceNameRejectReason({ name: '  ', takenNames: [] })).toBe('empty')
    expect(namespaceNameRejectReason({ name: 'a b', takenNames: [] })).toBe('charset')
    expect(namespaceNameRejectReason({ name: '_a', takenNames: [] })).toBe('charset')
    expect(namespaceNameRejectReason({ name: 'a.', takenNames: [] })).toBe('charset')
  })

  it('rejects a case-insensitive duplicate', () => {
    expect(namespaceNameRejectReason({ name: 'S2W', takenNames: ['s2w'] })).toBe(
      'duplicate'
    )
  })

  it('rejects a name that contains or is contained by another', () => {
    expect(namespaceNameRejectReason({ name: 's2w_hw', takenNames: ['s2w'] })).toBe(
      'overlap'
    )
    expect(namespaceNameRejectReason({ name: 's2w', takenNames: ['s2w.hw'] })).toBe(
      'overlap'
    )
    expect(namespaceNameRejectReason({ name: 's2wx', takenNames: ['s2w'] })).toBeNull()
  })
})

describe('prefixNamespace', () => {
  it('reads where generated keys would land', () => {
    expect(prefixNamespace('s2w', '_', ['s2w'])).toBe('s2w')
    expect(prefixNamespace('s2w_hardware', '_', ['s2w'])).toBe('s2w')
    expect(prefixNamespace('app', '_', ['s2w'])).toBeNull()
    expect(prefixNamespace('', '_', ['s2w'])).toBeNull()
  })
})

describe('countByNamespace', () => {
  it('counts every key once, the rest as ungrouped', () => {
    expect(
      countByNamespace(['s2w_a', 's2w.b', 'ota_c', 'hour_ago'], ['s2w', 'ota', 'empty'])
    ).toEqual({ byName: { s2w: 2, ota: 1, empty: 0 }, ungrouped: 1 })
  })
})

describe('namespaceSuggestions', () => {
  it('suggests shared first segments of ungrouped keys only', () => {
    const keys = ['s2w_a', 'ota_a', 'ota_b', 'ota.c', 'hour_ago', 'single', '__draft_1']
    expect(namespaceSuggestions(keys, ['s2w'])).toEqual([{ name: 'ota', count: 3 }])
  })

  it('skips a candidate that would overlap a declared name', () => {
    expect(namespaceSuggestions(['s2w_a', 's2w_b'], ['s2w.x'])).toEqual([])
  })
})

describe('resolveNamespaceFilterValue', () => {
  it('drops a deleted namespace back to All', () => {
    expect(resolveNamespaceFilterValue(3, [{ id: 3 }])).toBe(3)
    expect(resolveNamespaceFilterValue(4, [{ id: 3 }])).toBe('all')
    expect(resolveNamespaceFilterValue('ungrouped', [])).toBe('ungrouped')
    expect(resolveNamespaceFilterValue('junk', [])).toBe('all')
  })
})
