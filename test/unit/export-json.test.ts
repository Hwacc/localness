import { describe, expect, it } from 'vitest'
import {
  buildExportJson,
  serializeExportJson,
} from '#shared/utils/export-json'

const row = (key: string, texts: Record<string, string>) => ({ key, texts })

describe('buildExportJson', () => {
  it('makes one file per locale that has text, in column order', () => {
    const files = buildExportJson({
      rows: [
        row('login.title', { en: 'Sign in', fr: 'Connexion' }),
        row('login.cta', { en: 'Go' }),
      ],
      localeColumns: ['en', 'fr'],
    })

    expect(files.map((file) => file.locale)).toEqual(['en', 'fr'])
    expect(files[0]!.entries).toEqual({
      'login.title': 'Sign in',
      'login.cta': 'Go',
    })
    expect(files[1]!.entries).toEqual({ 'login.title': 'Connexion' })
  })

  it('leaves a locale with nothing published out entirely', () => {
    const files = buildExportJson({
      rows: [row('k', { en: 'text', de: '' })],
      localeColumns: ['en', 'de'],
    })

    // Not `{}`: an empty file would read as "this locale exists and is empty".
    expect(files.map((file) => file.locale)).toEqual(['en'])
  })

  it('omits a key rather than writing an empty string', () => {
    const files = buildExportJson({
      rows: [row('a', { en: 'one' }), row('b', { en: '' })],
      localeColumns: ['en'],
    })

    // A "" would override whatever fallback the consumer has for that locale.
    expect(files[0]!.entries).toEqual({ a: 'one' })
  })

  it('keeps dotted keys flat', () => {
    const files = buildExportJson({
      rows: [row('a.b.c', { en: 'nested-looking' })],
      localeColumns: ['en'],
    })

    // One file, one literal key — nesting is a formatter's job, not the export's.
    expect(files[0]!.entries).toEqual({ 'a.b.c': 'nested-looking' })
  })

  it('collapses the rows a key has one per tag', () => {
    const files = buildExportJson({
      rows: [
        row('k', { en: 'same text' }),
        row('k', { en: 'same text' }),
        row('k', { en: 'same text' }),
      ],
      localeColumns: ['en'],
    })

    expect(Object.keys(files[0]!.entries)).toEqual(['k'])
  })

  it('tolerates a row missing the locale column', () => {
    const files = buildExportJson({
      rows: [{ key: 'k', texts: {} } as never],
      localeColumns: ['en'],
    })

    expect(files).toEqual([])
  })
})

describe('serializeExportJson', () => {
  it('writes tab-indented JSON with a trailing newline', () => {
    const text = serializeExportJson({
      locale: 'en',
      entries: { k: 'v' },
    })

    expect(text).toBe('{\n\t"k": "v"\n}\n')
  })

  it('round-trips through JSON.parse', () => {
    const entries = { 'a.b': 'one', plain: 'two' }
    const text = serializeExportJson({ locale: 'en', entries })

    expect(JSON.parse(text)).toEqual(entries)
  })
})
