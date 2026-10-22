import { describe, expect, it } from 'vitest'
import { GitSyncFileFormat } from '#shared/constants'
import {
  readLocaleFile,
  unwritableKeys,
  writeLocaleFile,
} from '#server/libs/git-sync/layouts/locale-files/json-file'

const NESTED = GitSyncFileFormat.NESTED_JSON
const FLAT = GitSyncFileFormat.FLAT_JSON

describe('readLocaleFile', () => {
  it('joins nested keys with dots and remembers each path', () => {
    const file = readLocaleFile('{"a":{"b":"x"},"c.d":"y","n":3}')
    expect(file.entries).toEqual({ 'a.b': 'x', 'c.d': 'y', n: '3' })
    expect(file.paths.get('a.b')).toEqual(['a', 'b'])
    expect(file.paths.get('c.d')).toEqual(['c.d'])
  })

  it('records arrays and nulls as blocked paths', () => {
    const file = readLocaleFile('{"list":[1],"gone":null}')
    expect(file.entries).toEqual({})
    expect(file.blocked).toEqual([['list'], ['gone']])
  })

  it('accepts comments and trailing commas', () => {
    expect(readLocaleFile('{\n// note\n"a": "x",\n}').entries).toEqual({ a: 'x' })
  })

  it('rejects broken JSON and non-object roots', () => {
    expect(() => readLocaleFile('{"a":')).toThrow(/Invalid JSON/)
    expect(() => readLocaleFile('[]')).toThrow(/top level/)
  })
})

describe('unwritableKeys', () => {
  const file = readLocaleFile('{"a":"x","b":{"c":"y"},"list":[]}')

  it('always lets an existing key be written in place', () => {
    expect(unwritableKeys(file, ['a', 'b.c'], NESTED)).toEqual(new Set())
  })

  it('refuses a nested key under existing text, or one that would replace an object', () => {
    expect(unwritableKeys(file, ['a.z', 'list.x', 'b.d'], NESTED)).toEqual(
      new Set(['a.z', 'list.x'])
    )
    expect(unwritableKeys(file, ['b'], NESTED)).toEqual(new Set(['b']))
  })

  it('refuses both sides of a collision between new keys', () => {
    expect(unwritableKeys(file, ['n', 'n.m', 'q'], NESTED)).toEqual(
      new Set(['n', 'n.m'])
    )
  })

  it('refuses empty segments', () => {
    expect(unwritableKeys(file, ['x..y', '.z'], NESTED)).toEqual(
      new Set(['x..y', '.z'])
    )
  })

  it('places flat keys at the top level, so dotted keys do not collide', () => {
    expect(unwritableKeys(file, ['a.z', 'n', 'n.m'], FLAT)).toEqual(new Set())
    expect(unwritableKeys(file, ['b'], FLAT)).toEqual(new Set(['b']))
  })
})

describe('writeLocaleFile', () => {
  it('updates in place and appends new keys, keeping order, comments and indent', () => {
    const source = '{\n    // header\n    "z": "old",\n    "a": {\n        "b": "keep"\n    }\n}\n'
    const out = writeLocaleFile(source, { z: 'new', 'a.c': 'added', y: 'end' }, NESTED)
    expect(out).toBe(
      '{\n    // header\n    "z": "new",\n    "a": {\n        "b": "keep",\n        "c": "added"\n    },\n    "y": "end"\n}\n'
    )
  })

  it('writes dotted keys at the top level in flat format', () => {
    const out = writeLocaleFile('{\n  "a": "x"\n}\n', { 'b.c': 'y' }, FLAT)
    expect(JSON.parse(out)).toEqual({ a: 'x', 'b.c': 'y' })
  })

  it('writes an existing flat key in a nested file back to the same property', () => {
    const out = writeLocaleFile('{"a.b":"x"}', { 'a.b': 'y' }, NESTED)
    expect(JSON.parse(out)).toEqual({ 'a.b': 'y' })
  })

  it('creates a file when there is none', () => {
    const out = writeLocaleFile(null, { 'a.b': 'x' }, NESTED)
    expect(JSON.parse(out)).toEqual({ a: { b: 'x' } })
    expect(out.endsWith('\n')).toBe(true)
  })

  it('keeps CRLF line endings', () => {
    const out = writeLocaleFile('{\r\n  "a": "x"\r\n}\r\n', { b: 'y' }, NESTED)
    expect(out).toBe('{\r\n  "a": "x",\r\n  "b": "y"\r\n}\r\n')
  })
})
