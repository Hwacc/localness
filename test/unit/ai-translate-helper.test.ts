import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = {
  locale: string
  draftText: string | null
  publishedText: string | null
  sourceFingerprint: string
}

const db = vi.hoisted(() => ({
  locales: new Map<string, Record<string, unknown>>(),
  logs: [] as Array<Record<string, any>>,
  used: 0,
  limit: null as number | null,
  countWhere: null as any,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    i18nKey: { findUnique: async () => ({ fingerprint: 'fp2' }) },
    projectSettings: {
      findUnique: async () => ({ aiDailyLimit: db.limit }),
    },
    localeValue: {
      findUnique: async ({ where }: any) =>
        db.locales.get(JSON.stringify(where.i18nKeyId_locale)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const id = JSON.stringify(where.i18nKeyId_locale)
        db.locales.set(id, { ...(db.locales.get(id) ?? create), ...update })
      },
      update: async ({ where, data }: any) => {
        const id = JSON.stringify(where.i18nKeyId_locale)
        db.locales.set(id, { ...db.locales.get(id), ...data })
      },
    },
    translationLog: {
      create: async ({ data }: any) => {
        db.logs.push({ id: db.logs.length + 1, ...data })
      },
      findMany: async ({ where }: any) =>
        db.logs.filter((log) => log.batchId === where.batchId && log.source === 'ai'),
      count: async (args: any) => {
        db.countWhere = args.where
        return db.used
      },
    },
  },
}))

const { selectAiCells, clampToQuota, aiQuota, applyAiWrites, revertAiBatch } =
  await import('#server/helper/ai-translate')

const row = (
  locale: string,
  draftText: string | null,
  publishedText: string | null,
  sourceFingerprint = 'fp1'
): Row => ({ locale, draftText, publishedText, sourceFingerprint })

const range = {
  sourceLocale: 'en',
  targetLocales: ['en', 'fr'],
  overwriteDraft: false,
  includePublished: false,
}

const key = (locales: Row[], fingerprint = 'fp1', dirty = false) => ({
  id: 1,
  fingerprint,
  dirty,
  locales,
})

beforeEach(() => {
  db.locales.clear()
  db.logs = []
  db.used = 0
  db.limit = null
})

describe('selectAiCells', () => {
  const source = row('en', 'Save', 'Save')

  it('fills an empty cell and never the source language', () => {
    expect(selectAiCells([key([source])], range)).toEqual([
      { keyId: 1, locale: 'fr', reason: 'empty' },
    ])
  })

  it('skips a key with no source text', () => {
    expect(selectAiCells([key([row('en', '', null)])], range)).toEqual([])
  })

  it('leaves a draft alone unless overwrite is on', () => {
    const k = key([source, row('fr', 'Sauver', null)], 'fp1', true)
    expect(selectAiCells([k], range)).toEqual([])
    expect(selectAiCells([k], { ...range, overwriteDraft: true })).toEqual([
      { keyId: 1, locale: 'fr', reason: 'draft' },
    ])
  })

  it('never touches published text that matches its source', () => {
    const k = key([source, row('fr', 'Enregistrer', 'Enregistrer')])
    const all = { ...range, overwriteDraft: true, includePublished: true }
    expect(selectAiCells([k], all)).toEqual([])
  })

  it('touches outdated published text only with include published', () => {
    const k = key([source, row('fr', 'Vieux', 'Vieux', 'old')], 'fp2')
    expect(selectAiCells([k], range)).toEqual([])
    expect(selectAiCells([k], { ...range, includePublished: true })).toEqual([
      { keyId: 1, locale: 'fr', reason: 'outdated' },
    ])
  })
})

describe('quota', () => {
  it('clamps a request to what is left', () => {
    expect(clampToQuota(50, null, 999)).toBe(50)
    expect(clampToQuota(50, 100, 70)).toBe(30)
    expect(clampToQuota(50, 100, 100)).toBe(0)
    expect(clampToQuota(50, 100, 130)).toBe(0)
  })

  it('counts only AI batch rows of the project', async () => {
    db.limit = 10
    db.used = 4
    expect(await aiQuota(7)).toEqual({ limit: 10, used: 4, remaining: 6 })
    expect(db.countWhere).toMatchObject({
      source: 'ai',
      batchId: { not: null },
      i18nKey: { projectId: 7 },
    })
  })

  it('has no remaining figure without a limit', async () => {
    expect(await aiQuota(7)).toEqual({ limit: null, used: 0, remaining: null })
  })
})

describe('applyAiWrites / revertAiBatch', () => {
  const cell = JSON.stringify({ i18nKeyId: 1, locale: 'fr' })
  const seed = () =>
    db.locales.set(cell, {
      locale: 'fr',
      draftText: 'Vieux',
      publishedText: 'Vieux',
      sourceFingerprint: 'old',
    })

  it('writes a draft, keeps published text, and logs the batch', async () => {
    seed()
    const n = await applyAiWrites({
      batchId: 'b1',
      userId: 3,
      model: 'm',
      writes: [{ keyId: 1, locale: 'fr', text: 'Nouveau' }],
    })
    expect(n).toBe(1)
    expect(db.locales.get(cell)).toMatchObject({
      draftText: 'Nouveau',
      publishedText: 'Vieux',
      sourceFingerprint: 'fp2',
    })
    expect(db.logs[0]).toMatchObject({ source: 'ai', batchId: 'b1', model: 'm' })
  })

  it('reverts an untouched cell', async () => {
    seed()
    await applyAiWrites({
      batchId: 'b1',
      userId: 3,
      model: 'm',
      writes: [{ keyId: 1, locale: 'fr', text: 'Nouveau' }],
    })
    expect(await revertAiBatch('b1', 3, 7)).toEqual({ reverted: 1, skipped: 0 })
    expect(db.locales.get(cell)).toMatchObject({
      draftText: 'Vieux',
      sourceFingerprint: 'old',
    })
    expect(await revertAiBatch('b1', 3, 7)).toEqual({ reverted: 0, skipped: 1 })
  })

  it('does not overwrite a human edit made after the batch', async () => {
    seed()
    await applyAiWrites({
      batchId: 'b1',
      userId: 3,
      model: 'm',
      writes: [{ keyId: 1, locale: 'fr', text: 'Nouveau' }],
    })
    db.locales.set(cell, { ...db.locales.get(cell), draftText: 'Humain' })
    expect(await revertAiBatch('b1', 3, 7)).toEqual({ reverted: 0, skipped: 1 })
    expect(db.locales.get(cell)).toMatchObject({ draftText: 'Humain' })
  })
})
