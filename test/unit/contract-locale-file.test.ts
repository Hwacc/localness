import { describe, expect, it } from 'vitest'
import {
  LocaleFileFormat,
  inArray,
  readLocaleFile,
  unwritableKeys,
  writeLocaleFile,
} from '#shared/contract/locale-file'

const NESTED = LocaleFileFormat.NESTED_JSON
const FLAT = LocaleFileFormat.FLAT_JSON

describe('readLocaleFile', () => {
  it('joins nested keys with dots and remembers each path', () => {
    const file = readLocaleFile('{"a":{"b":"x"},"c.d":"y","n":3}')
    expect(file.entries).toEqual({ 'a.b': 'x', 'c.d': 'y', n: '3' })
    expect(file.paths.get('a.b')).toEqual(['a', 'b'])
    expect(file.paths.get('c.d')).toEqual(['c.d'])
  })

  it('reads arrays by index, recursing into objects and arrays inside them', () => {
    const file = readLocaleFile(
      '{"land":{"how_list":[{"title":"A","desc":"a"},{"title":"B"}]},"list":["x","y"],"grid":[["p"],[]],"gone":null,"holes":["h",null]}'
    )
    expect(file.entries).toEqual({
      'land.how_list.0.title': 'A',
      'land.how_list.0.desc': 'a',
      'land.how_list.1.title': 'B',
      'list.0': 'x',
      'list.1': 'y',
      'grid.0.0': 'p',
      'holes.0': 'h',
    })
    expect(file.paths.get('land.how_list.1.title')).toEqual(['land', 'how_list', 1, 'title'])
    expect(file.paths.get('grid.0.0')).toEqual(['grid', 0, 0])
    expect(file.blocked).toEqual([['gone'], ['holes', 1]])
    expect(file.arrays).toEqual([['land', 'how_list'], ['list'], ['grid'], ['grid', 0], ['grid', 1], ['holes']])
    expect(inArray(file.paths.get('list.0')!)).toBe(true)
    expect(inArray(['a', 'b'])).toBe(false)
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

  it('updates existing array elements but refuses any new key under an array', () => {
    const withArrays = readLocaleFile('{"how":[{"title":"A"}],"tips":["x"]}')
    const keys = ['how.0.title', 'tips.0', 'how.1.title', 'how.0.desc', 'tips.x', 'tips', 'how.0']
    const refused = new Set(['how.1.title', 'how.0.desc', 'tips.x', 'tips', 'how.0'])
    expect(unwritableKeys(withArrays, keys, NESTED)).toEqual(refused)
    expect(unwritableKeys(withArrays, keys, FLAT)).toEqual(refused)
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

  it('removes a key given null, and the nested objects it leaves empty', () => {
    const source = '{\n  "a": {\n    "b": {\n      "c": "x"\n    },\n    "d": "y"\n  },\n  "e": "z"\n}\n'
    const out = writeLocaleFile(source, { 'a.b.c': null, missing: null }, NESTED)
    expect(out).toBe('{\n  "a": {\n    "d": "y"\n  },\n  "e": "z"\n}\n')
    expect(JSON.parse(writeLocaleFile(out, { 'a.d': null }, NESTED))).toEqual({ e: 'z' })
  })

  it('updates an array element in place and leaves every other byte alone', () => {
    const source = '{\n  "land": {\n    "how_list": [\n      { "title": "A", "desc": "a" },\n      { "title": "B" }\n    ]\n  },\n  "tips": ["x", "y"] // two\n}\n'
    const out = writeLocaleFile(source, { 'land.how_list.1.title': 'B2', 'tips.0': 'x2' }, NESTED)
    expect(out).toBe(source.replace('"B"', '"B2"').replace('"x"', '"x2"'))
  })

  it('never removes an array element, nor the array or objects holding one', () => {
    const source = '{\n  "a": {\n    "list": [{ "t": "x" }],\n    "only": ["y"]\n  }\n}\n'
    const out = writeLocaleFile(source, { 'a.list.0.t': null, 'a.only.0': null }, NESTED)
    expect(out).toBe(source)
  })

  it('reads and updates arrays in a flat-json file', () => {
    const source = '{\n  "home.title": "x",\n  "steps": ["a", "b"]\n}\n'
    expect(readLocaleFile(source).entries).toEqual({ 'home.title': 'x', 'steps.0': 'a', 'steps.1': 'b' })
    const out = writeLocaleFile(source, { 'steps.1': 'B' }, FLAT)
    expect(out).toBe(source.replace('"b"', '"B"'))
  })
})
