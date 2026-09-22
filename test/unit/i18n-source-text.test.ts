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

const { shapeI18nKey, shapeI18nKeyRow, sourceTextOf, writeOriginToSourceLocale } =
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
  /*
   * The point of the model: a key's original text is the source language's draft,
   * so a row that still carries an `origin` column value must not report it.
   */
  it('derives a row origin from the source language, not from the column', () => {
    const row = shapeI18nKeyRow(
      {
        id: 1,
        key: 'a.b',
        origin: 'stale column value',
        description: null,
        updatedAt: new Date('2026-09-22T00:00:00.000Z'),
        locales: [locale('en', 'Save'), locale('ja', '保存')],
      },
      'ja'
    )

    expect(row.origin).toBe('保存')
  })

  it('derives a key origin the same way', () => {
    const key = shapeI18nKey(
      {
        id: 1,
        fingerprint: 'fp',
        origin: 'stale column value',
        locales: [locale('en', 'Save'), locale('ja', '保存')],
      },
      'ja'
    )

    expect(key.origin).toBe('保存')
  })
})

describe('writeOriginToSourceLocale', () => {
  it('writes the draft and leaves the published copy alone', async () => {
    await writeOriginToSourceLocale({
      projectId: 7,
      i18nKeyId: 12,
      origin: 'Save',
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

  it('writes nothing for an empty origin', async () => {
    await writeOriginToSourceLocale({
      projectId: 7,
      i18nKeyId: 12,
      origin: '',
    })

    expect(db.localeUpserts).toEqual([])
  })
})
