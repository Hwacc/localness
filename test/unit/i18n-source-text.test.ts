import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  localeUpserts: [] as Array<{
    create: Record<string, unknown>
    update: Record<string, unknown>
  }>,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    localeValue: {
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        db.localeUpserts.push({ create, update })
        return {}
      },
    },
    projectSettings: {
      // The language this project keeps a key's original text in.
      findUnique: async () => ({ localeFallback: 'ja' }),
    },
  },
}))

const { shapeI18nKey, shapeI18nKeyRow, sourceTextOf, writeSourceText } =
  await import('#server/helper/i18n')

const locale = (code: string, draftText: string | null) => ({
  locale: code,
  draftText,
  publishedText: null,
})

beforeEach(() => {
  db.localeUpserts = []
})

describe('sourceTextOf', () => {
  it('reads the source language draft', () => {
    expect(
      sourceTextOf([locale('en', 'Save'), locale('ja', '保存')], 'ja')
    ).toBe('保存')
  })

  it('is empty when that language has no row', () => {
    expect(sourceTextOf([locale('en', 'Save')], 'ja')).toBe('')
  })

  it('is empty when the draft is null', () => {
    expect(sourceTextOf([locale('ja', null)], 'ja')).toBe('')
  })
})

describe('shaping', () => {
  /* No field of its own for the original text: it rides in the locale map. */
  it('carries a row by locale, with no origin field', () => {
    const row = shapeI18nKeyRow({
      id: 1,
      key: 'a.b',
      description: null,
      updatedAt: new Date('2026-09-22T00:00:00.000Z'),
      locales: [locale('en', 'Save'), locale('ja', '保存')],
    })

    expect('origin' in row).toBe(false)
    expect(row.locales).toEqual([
      locale('en', 'Save'),
      locale('ja', '保存'),
    ])
  })

  it('carries a key by locale the same way', () => {
    const key = shapeI18nKey({
      id: 1,
      fingerprint: 'fp',
      locales: [locale('en', 'Save'), locale('ja', '保存')],
    })

    expect('origin' in key).toBe(false)
    expect(key.vue).toMatchObject({ en: 'Save', ja: '保存' })
  })

  /* Read by editors to disable their fields on a published entry. */
  it('reports an entry whose texts all match as published', () => {
    const key = shapeI18nKey({
      id: 1,
      fingerprint: 'fp',
      locales: [{ locale: 'en', draftText: 'Save', publishedText: 'Save' }],
    })

    expect(key.dirty).toBe(false)
  })

  it('reports an entry with nothing published as a draft', () => {
    const key = shapeI18nKey({
      id: 1,
      fingerprint: 'fp',
      locales: [locale('en', 'Save')],
    })

    expect(key.dirty).toBe(true)
  })
})

describe('writeSourceText', () => {
  it('writes the draft and leaves the published copy alone', async () => {
    await writeSourceText({
      projectId: 7,
      i18nKeyId: 12,
      text: 'Save',
    })

    expect(db.localeUpserts).toEqual([
      {
        create: {
          i18nKeyId: 12,
          locale: 'ja',
          draftText: 'Save',
          publishedText: null,
        },
        update: { draftText: 'Save' },
      },
    ])
  })

  it('writes nothing for an empty text', async () => {
    await writeSourceText({
      projectId: 7,
      i18nKeyId: 12,
      text: '',
    })

    expect(db.localeUpserts).toEqual([])
  })
})
