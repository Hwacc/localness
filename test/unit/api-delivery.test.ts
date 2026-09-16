import { beforeEach, describe, expect, it, vi } from 'vitest'

type KeyRow = { id: number; key: string; releaseIds: number[] }
type ValueRow = { locale: string; keyId: number; publishedText: string | null }

const db = vi.hoisted(() => ({
  project: null as {
    id: number
    name: string
    settings: { localeFallback: string } | null
  } | null,
  settings: null as { locales: unknown } | null,
  releases: [] as Array<{
    id: number
    name: string
    sort: number
    createdAt: Date
    updatedAt: Date
  }>,
  releaseIdByName: new Map<string, number>(),
  keys: [] as KeyRow[],
  values: [] as ValueRow[],
}))

function matchRelease(row: { releaseIds: number[] }, where: any): boolean {
  const rel = where.releases
  if (!rel) return true
  if (rel.none) return row.releaseIds.length === 0
  if (rel.some) return row.releaseIds.includes(rel.some.releaseId)
  return true
}

function filterKeys(where: any): KeyRow[] {
  return db.keys.filter((row) => matchRelease(row, where))
}

// Mirrors the helper's rule on purpose, so a change to it fails this test.
function isPublished(value: string | null): boolean {
  return value != null && value !== ''
}

// Reads the generated Prisma where, which may wrap its parts in AND.
function excludesEmpty(where: any): boolean {
  const parts = [where, ...(where.AND ?? [])]
  return parts.some((part) => part?.publishedText?.not === '')
}

vi.mock('#server/libs/prisma', () => ({
  default: {
    project: { findUnique: async () => db.project },
    projectSettings: { findUnique: async () => db.settings },
    projectRelease: {
      findMany: async () => db.releases,
      findFirst: async ({ where }: { where: { name: string } }) => {
        const id = db.releaseIdByName.get(where.name)
        return id == null ? null : { id }
      },
    },
    i18nKey: {
      count: async ({ where }: { where: any }) => filterKeys(where).length,
      findMany: async ({ where, select }: any) =>
        filterKeys(where)
          .map((row) => ({
            key: row.key,
            locales: db.values
              .filter(
                (value) =>
                  value.keyId === row.id &&
                  (!select?.locales?.where?.locale ||
                    value.locale === select.locales.where.locale)
              )
              .map((value) => ({ publishedText: value.publishedText })),
          }))
          .sort((a, b) => a.key.localeCompare(b.key)),
    },
    localeValue: {
      count: async ({ where }: any) => {
        const scoped = new Set(
          filterKeys(where.i18nKey ?? {}).map((row) => row.id)
        )
        const textRequired = Boolean(
          where.publishedText || where.AND
        )
        const skipEmpty = excludesEmpty(where)
        return db.values.filter(
          (value) =>
            value.locale === where.locale &&
            scoped.has(value.keyId) &&
            (!textRequired ||
              (value.publishedText !== null &&
                (!skipEmpty || isPublished(value.publishedText))))
        ).length
      },
    },
  },
}))

const {
  deliveryLocale,
  deliveryMeta,
  deliveryRuntime,
  projectLocales,
  resolveReleaseParam,
} = await import('#server/helper/api-delivery')
const { ApiTokenError } = await import('#server/helper/api-token')
const { DEFAULT_LOCALE_FALLBACK } = await import('#shared/constants')

const at = new Date('2026-09-16T00:00:00.000Z')

beforeEach(() => {
  db.project = {
    id: 1,
    name: 'web',
    settings: { localeFallback: 'en' },
  }
  db.settings = { locales: ['en', 'ja'] }
  db.releases = [
    { id: 4, name: 'v1', sort: 1, createdAt: at, updatedAt: at },
    { id: 5, name: 'v2', sort: 2, createdAt: at, updatedAt: at },
  ]
  db.releaseIdByName = new Map([
    ['v1', 4],
    ['v2', 5],
  ])
  db.keys = []
  db.values = []
})

describe('resolveReleaseParam', () => {
  it('reads an absent value as "no filter"', async () => {
    expect(await resolveReleaseParam(1, undefined)).toBeNull()
    expect(await resolveReleaseParam(1, '')).toBeNull()
    expect(await resolveReleaseParam(1, '   ')).toBeNull()
    expect(await resolveReleaseParam(1, null)).toBeNull()
  })

  it('takes a numeric id as-is', async () => {
    expect(await resolveReleaseParam(1, '12')).toBe(12)
    expect(await resolveReleaseParam(1, 12)).toBe(12)
  })

  it('resolves a name, because an agent knows "v1" and not the row id', async () => {
    expect(await resolveReleaseParam(1, 'v1')).toBe(4)
    expect(await resolveReleaseParam(1, ' v2 ')).toBe(5)
  })

  it('rejects an unknown name instead of quietly returning everything', async () => {
    // Returning the whole project would look filtered and not be.
    await expect(resolveReleaseParam(1, 'nope')).rejects.toThrow(ApiTokenError)
    await expect(resolveReleaseParam(1, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('projectLocales', () => {
  it('reads the project order and drops non-strings', async () => {
    db.settings = { locales: ['ja', 7, 'en'] }
    expect(await projectLocales(1)).toEqual(['ja', 'en'])
  })

  it('is empty rather than defaulted when the column is unusable', async () => {
    db.settings = { locales: 'en' }
    expect(await projectLocales(1)).toEqual([])
    db.settings = null
    expect(await projectLocales(1)).toEqual([])
  })
})

describe('deliveryMeta', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [4] },
      { id: 3, key: 'c', releaseIds: [5] },
      { id: 4, key: 'd', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'en', keyId: 2, publishedText: 'B' },
      { locale: 'en', keyId: 3, publishedText: null },
      { locale: 'ja', keyId: 1, publishedText: 'ア' },
      { locale: 'ja', keyId: 2, publishedText: '' },
    ]
  })

  it('lists the releases a caller can filter by', async () => {
    // Otherwise a caller can only use the filter if told a name out of band.
    const meta = await deliveryMeta(1, null)
    expect(meta?.releases.map((row) => row.name)).toEqual(['v1', 'v2'])
    expect(meta?.releases[0]).toMatchObject({ id: 4, name: 'v1', sort: 1 })
  })

  it('reports project-wide counts, so a slice is recognisable as a slice', async () => {
    const meta = await deliveryMeta(1, null)
    expect(meta?.coverage.keys).toBe(4)
    expect(meta?.coverage.projectKeys).toBe(4)
  })

  it('counts only in-scope keys once filtered', async () => {
    const meta = await deliveryMeta(1, 4)
    expect(meta?.coverage.keys).toBe(2)
    // The project total stays, which is what lets a caller see the remainder.
    expect(meta?.coverage.projectKeys).toBe(4)
    expect(meta?.release).toBe(4)
  })

  it('counts a key as published only when it has text', async () => {
    const meta = await deliveryMeta(1, null)
    // Key 3 is unpublished; key 2's ja value is '' and must not count.
    expect(meta?.coverage.publishedPerLocale).toEqual({ en: 2, ja: 1 })
  })

  it('hands the caller the fallback instead of merging it in', async () => {
    const meta = await deliveryMeta(1, null)
    expect(meta?.localeFallback).toBe('en')
    expect(meta?.locales).toEqual(['en', 'ja'])
  })

  it('falls back to the platform default when the project sets nothing', async () => {
    db.project = { id: 1, name: 'web', settings: null }
    expect((await deliveryMeta(1, null))?.localeFallback).toBe(
      DEFAULT_LOCALE_FALLBACK
    )
  })

  it('returns null for a project that is gone', async () => {
    db.project = null
    expect(await deliveryMeta(1, null)).toBeNull()
  })
})

describe('deliveryLocale', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [5] },
      { id: 3, key: 'c', releaseIds: [4] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'en', keyId: 2, publishedText: 'B' },
      { locale: 'en', keyId: 3, publishedText: '' },
    ]
  })

  it('leaves unpublished keys out rather than sending an empty string', async () => {
    // An empty string would turn "not translated yet" into "translated to nothing".
    expect(await deliveryLocale(1, 'en', null)).toEqual({ a: 'A', b: 'B' })
  })

  it('narrows to the labelled keys', async () => {
    expect(await deliveryLocale(1, 'en', 4)).toEqual({ a: 'A' })
  })

  it('is empty for a locale with nothing published', async () => {
    expect(await deliveryLocale(1, 'ja', null)).toEqual({})
  })
})

describe('deliveryRuntime', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [5] },
    ]
    db.values = [{ locale: 'ja', keyId: 2, publishedText: 'B' }]
  })

  it('keys the bundle by locale', async () => {
    const bundle = await deliveryRuntime(1, null, ['en', 'ja'])
    // Only `ja` has published text in this fixture.
    expect(bundle).toEqual({ ja: { b: 'B' } })
  })

  it('omits a locale that has nothing, so absent means absent', async () => {
    const bundle = await deliveryRuntime(1, null, ['en'])
    expect(bundle).toEqual({})
    expect(await deliveryRuntime(1, null, ['ja'])).toEqual({
      ja: { b: 'B' },
    })
  })

  it('applies the release filter to every locale at once', async () => {
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'ja', keyId: 1, publishedText: 'A' },
    ]
    expect(await deliveryRuntime(1, 4, ['en', 'ja'])).toEqual({
      en: { a: 'A' },
      ja: { a: 'A' },
    })
  })

  it('leaves an empty value out of every locale at once', async () => {
    db.values = [
      { locale: 'en', keyId: 1, publishedText: '' },
      { locale: 'ja', keyId: 1, publishedText: 'A' },
    ]
    // An empty value must not override the consumer's fallback.
    expect(await deliveryRuntime(1, null, ['en', 'ja'])).toEqual({
      ja: { a: 'A' },
    })
  })
})
