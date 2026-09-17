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
  /** Counts reads, so "one query for every locale" is a test and not a hope. */
  keyQueries: 0,
  groupQueries: 0,
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
      findMany: async ({ where, select }: any) => {
        db.keyQueries++
        return filterKeys(where)
          .map((row) => ({
            key: row.key,
            locales: db.values
              .filter((value) => {
                if (value.keyId !== row.id) return false
                const wanted = select?.locales?.where?.locale
                if (!wanted) return true
                // The helper asks for locales with `in`, so one query can serve
                // both the single-locale and the whole-bundle read.
                const allowed = Array.isArray(wanted.in) ? wanted.in : [wanted]
                return allowed.includes(value.locale)
              })
              .map((value) => ({
                locale: value.locale,
                publishedText: value.publishedText,
              })),
          }))
          .sort((a, b) => a.key.localeCompare(b.key))
      },
    },
    localeValue: {
      groupBy: async ({ where }: any) => {
        db.groupQueries++
        const scoped = new Set(
          filterKeys(where.i18nKey ?? {}).map((row) => row.id)
        )
        const allowed = new Set<string>(
          Array.isArray(where.locale?.in) ? where.locale.in : [where.locale]
        )
        const skipEmpty = excludesEmpty(where)
        const counts = new Map<string, number>()
        for (const value of db.values) {
          if (!allowed.has(value.locale)) continue
          if (!scoped.has(value.keyId)) continue
          if (value.publishedText === null) continue
          if (skipEmpty && !isPublished(value.publishedText)) continue
          counts.set(value.locale, (counts.get(value.locale) ?? 0) + 1)
        }
        return [...counts].map(([locale, count]) => ({
          locale,
          _count: { _all: count },
        }))
      },
    },
  },
}))

const {
  deliveryLocale,
  deliveryMeta,
  deliveryBundle,
  projectLocales,
  resolveReleaseParam,
} = await import('#server/helper/api-delivery')
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
  db.keyQueries = 0
  db.groupQueries = 0
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

  it('counts every locale in one grouped query, not one per locale', async () => {
    // `meta` is a diagnostic call, not the hot path, but it is one query per
    // locale per request the moment this becomes a loop again.
    await deliveryMeta(1, null)
    expect(db.groupQueries).toBe(1)
  })

  it('reports 0 for a locale with nothing published rather than omitting it', async () => {
    db.settings = { locales: ['en', 'ja', 'fr'] }
    expect((await deliveryMeta(1, null))?.coverage.publishedPerLocale).toEqual({
      en: 2,
      ja: 1,
      fr: 0,
    })
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

describe('deliveryBundle', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [5] },
    ]
    db.values = [{ locale: 'ja', keyId: 2, publishedText: 'B' }]
  })

  it('keys the bundle by locale', async () => {
    const bundle = await deliveryBundle(1, null, ['en', 'ja'])
    // Only `ja` has published text in this fixture.
    expect(bundle).toEqual({ ja: { b: 'B' } })
  })

  it('omits a locale that has nothing, so absent means absent', async () => {
    const bundle = await deliveryBundle(1, null, ['en'])
    expect(bundle).toEqual({})
    expect(await deliveryBundle(1, null, ['ja'])).toEqual({
      ja: { b: 'B' },
    })
  })

  it('applies the release filter to every locale at once', async () => {
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'ja', keyId: 1, publishedText: 'A' },
    ]
    expect(await deliveryBundle(1, 4, ['en', 'ja'])).toEqual({
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
    expect(await deliveryBundle(1, null, ['en', 'ja'])).toEqual({
      ja: { a: 'A' },
    })
  })

  it('reads every locale in one query, not one per locale', async () => {
    // This is the endpoint a consumer hits on every page load.
    db.keys = [
      { id: 1, key: 'a', releaseIds: [] },
      { id: 2, key: 'b', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'ja', keyId: 1, publishedText: 'ア' },
      { locale: 'ja', keyId: 2, publishedText: 'イ' },
    ]
    const bundle = await deliveryBundle(1, null, ['en', 'ja'])
    expect(db.keyQueries).toBe(1)
    expect(bundle).toEqual({ en: { a: 'A' }, ja: { a: 'ア', b: 'イ' } })
  })

  it('emits locales in the project order and keys in key order', async () => {
    db.keys = [
      { id: 1, key: 'b', releaseIds: [] },
      { id: 2, key: 'a', releaseIds: [] },
    ]
    db.values = [
      { locale: 'zh', keyId: 1, publishedText: '乙' },
      { locale: 'en', keyId: 2, publishedText: 'A' },
    ]
    // Byte-stable, so a consumer that hashes the bundle for its own cache gets
    // one answer rather than a reshuffle per request.
    const bundle = await deliveryBundle(1, null, ['en', 'zh'])
    expect(JSON.stringify(bundle)).toBe(
      JSON.stringify({ en: { a: 'A' }, zh: { b: '乙' } })
    )
  })
})
