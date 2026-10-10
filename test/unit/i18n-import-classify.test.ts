import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_KEY_CONVENTION } from '#shared/utils/key-convention'
import { fpTranslation } from '#shared/utils'

type LocaleRow = {
  locale: string
  draftText: string | null
  publishedText: string | null
}

type KeyRow = {
  id: number
  projectId: number
  key: string
  fingerprint: string
  gitSyncEnabled: boolean
  locales: LocaleRow[]
}

const db = vi.hoisted(() => ({
  keys: [] as KeyRow[],
  logs: [] as Array<{ action: string; status: string; afterData?: unknown }>,
  releases: [] as Array<{ id: number; projectId: number }>,
  membership: [] as Array<{ releaseId: number; ids: number[] }>,
  nextId: 100,
  failOnKey: null as string | null,
  reset() {
    this.keys = []
    this.logs = []
    this.releases = []
    this.membership = []
    this.nextId = 100
    this.failOnKey = null
  },
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    i18nKey: {
      create: async ({ data }: any) => {
        if (db.failOnKey === data.key) throw new Error('insert exploded')
        const row: KeyRow = {
          id: db.nextId++,
          projectId: data.projectId,
          key: data.key,
          fingerprint: data.fingerprint,
          gitSyncEnabled: data.gitSyncEnabled,
          locales: data.locales.create,
        }
        db.keys.push(row)
        return { id: row.id }
      },
      update: async ({ where, data }: any) => {
        const row = db.keys.find((candidate) => candidate.id === where.id)!
        Object.assign(row, data)
        return row
      },
    },
    localeValue: {
      upsert: async ({ where, create, update }: any) => {
        const { i18nKeyId, locale } = where.i18nKeyId_locale
        const row = db.keys.find((candidate) => candidate.id === i18nKeyId)!
        const stored = row.locales.find((candidate) => candidate.locale === locale)
        if (stored) Object.assign(stored, update)
        else row.locales.push({ locale: create.locale, ...update })
        return {}
      },
    },
  }

  const client = {
    projectSettings: {
      findUnique: async () => ({
        locales: ['en', 'zh_cn', 'ja'],
        localeFallback: 'en',
        keyPrefix: '',
        keySeparator: '_',
        keyStyle: 'snake_case',
        keyMaxDepth: 4,
      }),
    },
    i18nKey: {
      findMany: async ({ where }: any) =>
        db.keys
          .filter((row) => row.projectId === where.projectId)
          .map((row) => structuredClone(row)),
    },
    projectRelease: {
      findFirst: async ({ where }: any) =>
        db.releases.find(
          (row) => row.id === where.id && row.projectId === where.projectId
        ) ?? null,
    },
    projectLog: {
      create: async ({ data }: any) => {
        db.logs.push(data)
        return data
      },
    },
    // Rolls back like the real one, so a failed batch leaves nothing behind.
    $transaction: async (fn: (c: typeof tx) => Promise<unknown>) => {
      const snapshot = structuredClone(db.keys)
      try {
        return await fn(tx)
      } catch (error) {
        db.keys = snapshot
        throw error
      }
    },
  }
  return { default: client }
})

vi.mock('#server/helper/release', () => ({
  setReleaseMembership: async (params: { releaseId: number; ids: number[] }) => {
    db.membership.push({ releaseId: params.releaseId, ids: params.ids })
    return { ok: true, changed: params.ids.length }
  },
}))

const { classifyImport, applyImport, ImportError } = await import(
  '#server/helper/i18n-import'
)

const PROJECT = 1
const LOCALES = ['en', 'zh_cn', 'ja']

function published(texts: Record<string, string>): LocaleRow[] {
  return Object.entries(texts).map(([locale, text]) => ({
    locale,
    draftText: text,
    publishedText: text,
  }))
}

function existing(id: number, key: string, locales: LocaleRow[]): KeyRow {
  return {
    id,
    projectId: PROJECT,
    key,
    fingerprint: '',
    gitSyncEnabled: true,
    locales,
  }
}

function classify(payload: Record<string, Record<string, string>>, keys: KeyRow[] = []) {
  return classifyImport({
    payload,
    projectLocales: LOCALES,
    sourceLocale: 'en',
    existing: keys,
    convention: DEFAULT_KEY_CONVENTION,
  })
}

describe('classifyImport', () => {
  it('marks unknown keys new and reports locales the project lacks', () => {
    const preview = classify({
      en: { ok: 'OK' },
      zh_cn: { ok: '确定' },
      vi: { ok: 'Đồng ý' },
    })
    expect(preview.ignoredLocales).toEqual(['vi'])
    expect(preview.rows).toEqual([
      expect.objectContaining({
        key: 'ok',
        kind: 'new',
        texts: { en: 'OK', zh_cn: '确定' },
        changes: [],
      }),
    ])
    expect(preview.counts).toEqual({ new: 1, same: 0, changed: 0, skipped: 0 })
  })

  it('treats a key whose draft and published both match as the same', () => {
    const preview = classify({ en: { ok: 'OK' } }, [
      existing(1, 'ok', published({ en: 'OK', ja: 'OK' })),
    ])
    expect(preview.rows[0]).toMatchObject({ kind: 'same', changes: [] })
  })

  it('lists per-locale changes and flags an unpublished draft', () => {
    const preview = classify(
      { en: { ok: 'OK' }, zh_cn: { ok: '好的' } },
      [
        existing(1, 'ok', [
          { locale: 'en', draftText: 'OK', publishedText: 'OK' },
          { locale: 'zh_cn', draftText: '确认', publishedText: '确定' },
        ]),
      ]
    )
    expect(preview.rows[0]).toMatchObject({
      kind: 'changed',
      hasUnpublishedDraft: true,
      changes: [{ locale: 'zh_cn', before: '确定', after: '好的' }],
    })
  })

  it('skips a key with no original text anywhere, but not one the project already names', () => {
    const preview = classify({ zh_cn: { fresh: '新', known: '已知' } }, [
      existing(1, 'known', published({ en: 'Known' })),
    ])
    expect(preview.skipped).toEqual([{ key: 'fresh', reason: 'no-source-text' }])
    expect(preview.rows).toEqual([
      expect.objectContaining({ key: 'known', kind: 'changed' }),
    ])
  })

  it('refuses reserved and empty keys', () => {
    const preview = classify({ en: { __draft_abc: 'x', '  ': 'y' } })
    expect(preview.skipped).toEqual([
      { key: '__draft_abc', reason: 'reserved-prefix' },
      { key: '', reason: 'empty-key' },
    ])
    expect(preview.counts.skipped).toBe(2)
  })

  it('drops keys whose text is all empty', () => {
    const preview = classify({ en: { blank: '   ' } })
    expect(preview.rows).toEqual([])
    expect(preview.skipped).toEqual([])
  })

  it('reports naming violations without refusing the key', () => {
    const preview = classify({ en: { 'login.title': 'Sign in' } })
    expect(preview.rows[0]!.kind).toBe('new')
    expect(preview.rows[0]!.violations).toContain('charset')
  })

  it('detects mixed placeholder syntax across the payload', () => {
    const preview = classify({ en: { a: 'Hi {name}', b: 'Bye {{name}}' } })
    expect(preview.interpolationStyles).toEqual(['single-brace', 'double-brace'])
  })
})

describe('applyImport', () => {
  beforeEach(() => db.reset())

  it('creates new keys published and out of Git sync', async () => {
    const result = await applyImport({
      projectId: PROJECT,
      userId: 7,
      payload: { en: { ok: 'OK' }, ja: { ok: 'オーケー' } },
      overwriteKeys: [],
    })
    expect(result).toMatchObject({ created: 1, updated: 0, unchanged: 0 })
    expect(db.keys[0]).toMatchObject({
      key: 'ok',
      gitSyncEnabled: false,
      fingerprint: fpTranslation('OK'),
      locales: [
        { locale: 'en', draftText: 'OK', publishedText: 'OK' },
        { locale: 'ja', draftText: 'オーケー', publishedText: 'オーケー' },
      ],
    })
    expect(db.logs).toEqual([
      expect.objectContaining({ action: 'IMPORT', status: 'SUCCESS' }),
    ])
  })

  it('overwrites only the selected changed keys and keeps their Git flag', async () => {
    db.keys = [
      existing(1, 'a', published({ en: 'A' })),
      existing(2, 'b', published({ en: 'B' })),
    ]
    const result = await applyImport({
      projectId: PROJECT,
      userId: 7,
      payload: { en: { a: 'A2', b: 'B2' } },
      overwriteKeys: ['a'],
    })
    expect(result).toMatchObject({ created: 0, updated: 1, unchanged: 1 })
    const [a, b] = db.keys
    expect(a).toMatchObject({
      gitSyncEnabled: true,
      fingerprint: fpTranslation('A2'),
      locales: [{ locale: 'en', draftText: 'A2', publishedText: 'A2' }],
    })
    expect(b!.locales).toEqual(published({ en: 'B' }))
  })

  it('adds a missing locale row on overwrite without touching the others', async () => {
    db.keys = [existing(1, 'a', published({ en: 'A' }))]
    await applyImport({
      projectId: PROJECT,
      userId: 7,
      payload: { ja: { a: 'エー' } },
      overwriteKeys: ['a'],
    })
    expect(db.keys[0]!.locales).toEqual([
      { locale: 'en', draftText: 'A', publishedText: 'A' },
      { locale: 'ja', draftText: 'エー', publishedText: 'エー', sourceFingerprint: '' },
    ])
    // The original text did not change, so neither does its fingerprint.
    expect(db.keys[0]!.fingerprint).toBe('')
  })

  it('labels every imported key with the release, unchanged ones included', async () => {
    db.releases = [{ id: 5, projectId: PROJECT }]
    db.keys = [existing(1, 'same', published({ en: 'S' }))]
    const result = await applyImport({
      projectId: PROJECT,
      userId: 7,
      payload: { en: { same: 'S', fresh: 'F' } },
      overwriteKeys: [],
      releaseId: 5,
    })
    expect(db.membership).toEqual([{ releaseId: 5, ids: [1, 100] }])
    expect(result.releaseLinked).toBe(2)
  })

  it('refuses a release from another project before writing anything', async () => {
    db.releases = [{ id: 5, projectId: 99 }]
    await expect(
      applyImport({
        projectId: PROJECT,
        userId: 7,
        payload: { en: { ok: 'OK' } },
        overwriteKeys: [],
        releaseId: 5,
      })
    ).rejects.toBeInstanceOf(ImportError)
    expect(db.keys).toEqual([])
  })

  it('rolls the whole batch back when one write fails', async () => {
    db.failOnKey = 'b'
    await expect(
      applyImport({
        projectId: PROJECT,
        userId: 7,
        payload: { en: { a: 'A', b: 'B' } },
        overwriteKeys: [],
      })
    ).rejects.toThrow('insert exploded')
    expect(db.keys).toEqual([])
    expect(db.logs).toEqual([
      expect.objectContaining({ action: 'IMPORT', status: 'FAILED' }),
    ])
  })
})
