import { describe, expect, it } from 'vitest'
import {
  buildExportRows,
  exportLocaleColumns,
  type ExportKeyInput,
  type ExportTagInput,
} from '#server/helper/export-rows'

function key(
  id: number,
  name: string,
  locales: Record<string, string | null>
): ExportKeyInput {
  return {
    id,
    key: name,
    locales: Object.entries(locales).map(([locale, publishedText]) => ({
      locale,
      publishedText,
    })),
  }
}

function tag(id: number, pageId: number, i18nKeyId: number | null): ExportTagInput {
  return { id, pageId, i18nKeyId }
}

const pics = new Map([
  [1, 'login.jpg'],
  [2, 'home.jpg'],
])

describe('exportLocaleColumns', () => {
  it('keeps the picked order and drops duplicates', () => {
    expect(
      exportLocaleColumns({
        locales: ['ja', 'en', 'ja'],
        fallbackLocale: 'en',
        includeFallbackLocale: true,
      })
    ).toEqual(['ja', 'en'])
  })

  it('prepends the fallback locale when it was not picked', () => {
    expect(
      exportLocaleColumns({
        locales: ['ja', 'ko'],
        fallbackLocale: 'en',
        includeFallbackLocale: true,
      })
    ).toEqual(['en', 'ja', 'ko'])
  })

  it('leaves the fallback out when the switch is off', () => {
    expect(
      exportLocaleColumns({
        locales: ['ja', 'ko'],
        fallbackLocale: 'en',
        includeFallbackLocale: false,
      })
    ).toEqual(['ja', 'ko'])
  })
})

describe('buildExportRows', () => {
  it('emits one row per tag of a selected key', () => {
    const result = buildExportRows({
      keys: [key(10, 'login.title', { en: 'Sign in' })],
      tags: [tag(100, 1, 10), tag(101, 2, 10)],
      picByPageId: pics,
      localeColumns: ['en'],
    })
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.pic)).toEqual(['login.jpg', 'home.jpg'])
    expect(result.rows[0]).toMatchObject({
      id: 100,
      keyId: 10,
      key: 'login.title',
      texts: { en: 'Sign in' },
    })
    expect(result.tagIds).toEqual([100, 101])
  })

  it('gives a key with no tag a row with an empty pic', () => {
    const result = buildExportRows({
      keys: [key(10, 'plain.entry', { en: 'Text' })],
      tags: [],
      picByPageId: pics,
      localeColumns: ['en'],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: null, pic: '', keyId: 10 })
    expect(result.keysWithoutTag).toBe(1)
    expect(result.tagIds).toEqual([])
  })

  it('ignores tags on pages that were not selected', () => {
    // The tag lives on page 9, which has no screenshot in this export, so the
    // key falls back to a single pic-less row instead of vanishing.
    const result = buildExportRows({
      keys: [key(10, 'a', { en: 'Text' })],
      tags: [tag(100, 9, 10)],
      picByPageId: pics,
      localeColumns: ['en'],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ id: null, pic: '' })
    expect(result.tagIds).toEqual([])
  })

  it('skips a key with no published text anywhere', () => {
    const result = buildExportRows({
      keys: [
        key(10, 'draft.only', { en: null, ja: '' }),
        key(11, 'shipped', { en: 'Text' }),
      ],
      tags: [tag(100, 1, 10), tag(101, 1, 11)],
      picByPageId: pics,
      localeColumns: ['en'],
    })
    expect(result.rows.map((r) => r.keyId)).toEqual([11])
    expect(result.skipped['no-published-text']).toBe(1)
    // The skipped key's tag must not be drawn either.
    expect(result.tagIds).toEqual([101])
  })

  it('writes only the requested locale columns, empty when missing', () => {
    const result = buildExportRows({
      keys: [key(10, 'a', { en: 'Sign in', ja: 'ログイン', ko: '로그인' })],
      tags: [tag(100, 1, 10)],
      picByPageId: pics,
      localeColumns: ['en', 'zh_cn'],
    })
    expect(result.rows[0]!.texts).toEqual({ en: 'Sign in', zh_cn: '' })
  })

  it('ignores tags with no linked key', () => {
    const result = buildExportRows({
      keys: [key(10, 'a', { en: 'Text' })],
      tags: [tag(100, 1, null), tag(101, 1, 10)],
      picByPageId: pics,
      localeColumns: ['en'],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.tagIds).toEqual([101])
  })
})
