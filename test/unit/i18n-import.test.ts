import { describe, expect, it } from 'vitest'
import {
  describeLocaleOverlap,
  detectInterpolationStyles,
  guessLocale,
  importDuplicateDropped,
  importDuplicateText,
  importWarningText,
  isLosslessDuplicate,
  localeLabelFromFilename,
  normalizeImportText,
  parseLocaleJson,
  readXlsxSheet,
  restrictSheetDuplicate,
  type ImportSheetDuplicate,
} from '#shared/utils/i18n-import'

const LOCALES = ['en', 'zh_cn', 'zh_tw', 'ja', 'pt']

/** One JSON line per argument, so line numbers in assertions read off the source. */
function json(...lines: string[]): string {
  return lines.join('\n')
}

describe('normalizeImportText', () => {
  it('unifies line endings and trims the ends only', () => {
    expect(normalizeImportText('  a\r\nb\rc  ')).toBe('a\nb\nc')
    expect(normalizeImportText('a  b')).toBe('a  b')
  })

  it('stringifies numbers and booleans', () => {
    expect(normalizeImportText(1)).toBe('1')
    expect(normalizeImportText(false)).toBe('false')
  })

  it('treats null, empty and whitespace as no translation', () => {
    expect(normalizeImportText(null)).toBeNull()
    expect(normalizeImportText(undefined)).toBeNull()
    expect(normalizeImportText('')).toBeNull()
    expect(normalizeImportText('   ')).toBeNull()
    expect(normalizeImportText(Number.NaN)).toBeNull()
    expect(normalizeImportText({})).toBeNull()
  })
})

describe('parseLocaleJson', () => {
  it('joins nested paths with a dot', () => {
    const { entries, warnings, duplicates } = parseLocaleJson(
      JSON.stringify({
        login: { title: 'Sign in', form: { submit: 'Go' } },
        ok: 'OK',
      })
    )
    expect({ ...entries }).toEqual({
      'login.title': 'Sign in',
      'login.form.submit': 'Go',
      ok: 'OK',
    })
    expect(warnings).toEqual([])
    expect(duplicates).toEqual([])
  })

  it('skips arrays with the line they are on', () => {
    const { entries, warnings } = parseLocaleJson(
      json('{', '  "x": "y",', '  "items": ["a", "b"]', '}')
    )
    expect({ ...entries }).toEqual({ x: 'y' })
    expect(warnings).toEqual([{ kind: 'array-value', key: 'items', line: 3 }])
    expect(importWarningText(warnings[0]!)).toBe(
      '"items" (line 3) is an array and was skipped.'
    )
  })

  it('catches a property repeated word for word, which JSON.parse hides', () => {
    const { entries, duplicates } = parseLocaleJson(
      json('{', '  "ok": "A",', '  "x": "y",', '  "ok": "B",', '  "ok": "Okay"', '}')
    )
    expect(entries.ok).toBe('Okay')
    expect(duplicates).toHaveLength(1)
    expect(importDuplicateText(duplicates[0]!)).toBe(
      '"ok" is defined 3 times (lines 2, 4, 5). The last one is kept: "Okay".'
    )
    expect(importDuplicateDropped(duplicates[0]!)).toEqual([
      '"A" (line 2)',
      '"B" (line 4)',
    ])
  })

  it('names the route each definition took when nesting and a dotted key collide', () => {
    const { entries, duplicates } = parseLocaleJson(
      json(
        '{',
        '  "login": {',
        '    "title": "Log in"',
        '  },',
        '  "login.title": "Sign in"',
        '}'
      )
    )
    expect(entries['login.title']).toBe('Sign in')
    expect(importDuplicateText(duplicates[0]!)).toBe(
      '"login.title" is defined twice: line 3 as nested keys (login → title), line 5 as the key "login.title". The later one is kept: "Sign in".'
    )
  })

  it('folds a key with stray spaces into its trimmed twin and says so', () => {
    const { duplicates } = parseLocaleJson(
      json('{', '  "ok": "A",', '  " ok": "B"', '}')
    )
    expect(importDuplicateText(duplicates[0]!)).toBe(
      '"ok" is defined twice: line 2 as the key "ok", line 3 as the key " ok". The later one is kept: "B".'
    )
  })

  it('reports a trimmed key that collides with nothing as a warning', () => {
    const { entries, warnings, duplicates } = parseLocaleJson(
      json('{', '  " ok ": "A"', '}')
    )
    expect({ ...entries }).toEqual({ ok: 'A' })
    expect(duplicates).toEqual([])
    expect(importWarningText(warnings[0]!)).toBe(
      '" ok " (line 2) has spaces at the start or end and is imported as "ok".'
    )
  })

  it('treats duplicates with identical text as lossless', () => {
    const { duplicates } = parseLocaleJson(json('{', '"a": "x",', '"a": "x"', '}'))
    expect(isLosslessDuplicate(duplicates[0]!)).toBe(true)
    expect(importDuplicateDropped(duplicates[0]!)).toEqual([])
  })

  it('ignores empty definitions, so an empty later value does not win', () => {
    const { entries, duplicates } = parseLocaleJson(
      json('{', '"a": "x",', '"a": ""', '}')
    )
    expect(entries.a).toBe('x')
    expect(duplicates).toEqual([])
  })

  it('quotes long values as an excerpt', () => {
    const long = 'x'.repeat(80)
    const { duplicates } = parseLocaleJson(
      JSON.stringify({ a: 'short' }).replace('}', `, "a": "${long}"}`)
    )
    expect(importDuplicateText(duplicates[0]!)).toContain(`"${'x'.repeat(60)}…"`)
  })

  it('keeps a __proto__ key as data', () => {
    const { entries } = parseLocaleJson('{"__proto__": "x"}')
    expect(Object.keys(entries)).toEqual(['__proto__'])
    expect(entries['__proto__']).toBe('x')
  })

  it('tolerates comments and trailing commas', () => {
    const { entries } = parseLocaleJson(json('{', '  // title', '  "a": "x",', '}'))
    expect({ ...entries }).toEqual({ a: 'x' })
  })

  it('reports where the JSON breaks', () => {
    expect(() => parseLocaleJson(json('{', '  "a": "x"', '  "b": "y"', '}'))).toThrow(
      /line 3/
    )
  })

  it('rejects a root that is not an object', () => {
    expect(() => parseLocaleJson('["a"]')).toThrow(/object at the top level/)
    expect(() => parseLocaleJson('"a"')).toThrow(/object at the top level/)
  })
})

describe('localeLabelFromFilename', () => {
  it('drops the last extension and any directory', () => {
    expect(localeLabelFromFilename('zh-CN.json')).toBe('zh-CN')
    expect(localeLabelFromFilename('locales/en.json')).toBe('en')
    expect(localeLabelFromFilename('messages.en.json')).toBe('messages.en')
  })
})

describe('guessLocale', () => {
  it('matches ignoring case and dash versus underscore', () => {
    expect(guessLocale('zh-CN', LOCALES)).toBe('zh_cn')
    expect(guessLocale('ZH_TW', LOCALES)).toBe('zh_tw')
    expect(guessLocale('en', LOCALES)).toBe('en')
  })

  it('falls back to a unique base language', () => {
    expect(guessLocale('en-US', LOCALES)).toBe('en')
    expect(guessLocale('pt-BR', LOCALES)).toBe('pt')
  })

  it('matches a language name header', () => {
    expect(guessLocale('English', LOCALES)).toBe('en')
  })

  it('leaves ambiguous and unknown labels for the user', () => {
    expect(guessLocale('zh', LOCALES)).toBeNull()
    expect(guessLocale('vi', LOCALES)).toBeNull()
    expect(guessLocale('', LOCALES)).toBeNull()
  })
})

describe('readXlsxSheet', () => {
  it('finds the key column and treats other named columns as locales', () => {
    const result = readXlsxSheet([
      ['Key', 'en', 'zh-CN'],
      ['ok', 'OK', '确定'],
      ['count', 3, null],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.columns.map((column) => column.label)).toEqual(['en', 'zh-CN'])
    expect({ ...result.columns[0]!.entries }).toEqual({ ok: 'OK', count: '3' })
    expect({ ...result.columns[1]!.entries }).toEqual({ ok: '确定' })
  })

  it('ignores the columns a Localness export adds', () => {
    const result = readXlsxSheet([
      ['id', 'key_id', 'pic', 'key', 'en'],
      [1, 2, 'a.jpg', 'ok', 'OK'],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.columns.map((column) => column.label)).toEqual(['en'])
  })

  it('reports keyless rows with text', () => {
    const result = readXlsxSheet([
      ['key', 'en'],
      ['', 'orphan'],
      ['', ''],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings).toEqual([{ kind: 'missing-key', row: 2 }])
  })

  it('merges repeated keys cell by cell and says which row each locale kept', () => {
    const result = readXlsxSheet([
      ['key', 'en', 'zh-CN', 'ja'],
      ['ok', 'OK', '确定', 'OK'],
      ['x', 'X', '', ''],
      ['ok', 'Okay', '', 'OK'],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect({ ...result.columns[0]!.entries }).toMatchObject({ ok: 'Okay' })
    expect({ ...result.columns[1]!.entries }).toMatchObject({ ok: '确定' })

    const [duplicate] = result.duplicates
    // `ja` agrees on both rows and `zh-CN` has one value, so only `en` differs.
    expect(importDuplicateText(duplicate!)).toBe(
      '"ok" is on rows 2 and 4. Each locale keeps its last non-empty cell: en "Okay" (row 4).'
    )
    expect(importDuplicateDropped(duplicate!)).toEqual(['en "OK" (row 2)'])
  })

  it('treats a repeated row with the same text as lossless', () => {
    const result = readXlsxSheet([
      ['key', 'en'],
      ['ok', 'OK'],
      ['ok', 'OK'],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(isLosslessDuplicate(result.duplicates[0]!)).toBe(true)
  })

  it('reports a key cell with stray spaces', () => {
    const result = readXlsxSheet([
      ['key', 'en'],
      [' ok', 'OK'],
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(importWarningText(result.warnings[0]!)).toBe(
      '" ok" (row 2) has spaces at the start or end and is imported as "ok".'
    )
  })

  it('refuses a sheet without a key column', () => {
    expect(readXlsxSheet([['name', 'en']])).toEqual({
      ok: false,
      reason: 'no-key-column',
    })
    expect(readXlsxSheet([])).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('restrictSheetDuplicate', () => {
  it('drops columns that are not imported, which can make it lossless', () => {
    const duplicate: ImportSheetDuplicate = {
      kind: 'sheet',
      key: 'ok',
      rows: [2, 3],
      cells: [
        {
          label: 'en',
          kept: { row: 3, text: 'Okay' },
          dropped: [{ row: 2, text: 'OK' }],
        },
      ],
    }
    expect(isLosslessDuplicate(restrictSheetDuplicate(duplicate, new Set(['ja'])))).toBe(
      true
    )
    expect(restrictSheetDuplicate(duplicate, new Set(['en'])).cells).toHaveLength(1)
  })
})

describe('describeLocaleOverlap', () => {
  const a = { label: 'en.json', entries: { x: '1', y: '2', z: '3' } }

  it('warns with counts and names the winner when texts differ', () => {
    const b = { label: 'messages.en.json', entries: { x: '1', y: 'other' } }
    expect(describeLocaleOverlap('en', [a, b])).toEqual({
      level: 'warning',
      text: 'en.json and messages.en.json both map to en. 2 keys are in both, 1 with different text — for those, messages.en.json (lower in the list) wins.',
    })
  })

  it('is only informational when shared keys agree', () => {
    const b = { label: 'b.json', entries: { x: '1' } }
    expect(describeLocaleOverlap('en', [a, b])).toEqual({
      level: 'info',
      text: 'en.json and b.json both map to en. They share 1 key, all with identical text.',
    })
  })

  it('says nothing overlaps when no key is shared', () => {
    const b = { label: 'b.json', entries: { w: '1' } }
    expect(describeLocaleOverlap('en', [a, b]).text).toBe(
      'en.json and b.json both map to en. No key is in both, so they are simply combined.'
    )
  })

  it('words three or more sources without naming a single winner', () => {
    const b = { label: 'b.json', entries: { x: 'B' } }
    const c = { label: 'c.json', entries: { w: '1' } }
    expect(describeLocaleOverlap('en', [a, b, c]).text).toBe(
      'en.json, b.json and c.json all map to en. 1 key is in more than one, 1 with different text — for those, the lowest one in the list that has the key wins.'
    )
  })
})

describe('detectInterpolationStyles', () => {
  it('tells vue-i18n and i18next placeholders apart', () => {
    expect(detectInterpolationStyles(['Hi {name}'])).toEqual(['single-brace'])
    expect(detectInterpolationStyles(['Hi {{name}}'])).toEqual(['double-brace'])
    expect(detectInterpolationStyles(['Hi {name}', 'Bye {{ name }}'])).toEqual([
      'single-brace',
      'double-brace',
    ])
  })

  it('ignores ICU plurals and plain text', () => {
    expect(
      detectInterpolationStyles(['{count, plural, one {# item} other {# items}}'])
    ).toEqual([])
    expect(detectInterpolationStyles(['plain'])).toEqual([])
  })
})
