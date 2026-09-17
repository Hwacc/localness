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

function localeFilter(wanted: any): string[] | null {
  if (!wanted) return null
  if (Array.isArray(wanted.in)) return wanted.in
  if (Array.isArray(wanted)) return wanted
  return [wanted]
}

function matchesPublishedClause(value: ValueRow, clause: any): boolean {
  const parts = [clause, ...(clause.AND ?? [])]
  for (const part of parts) {
    if (!part) continue
    if (part.locale && value.locale !== part.locale) return false
    if (typeof part.publishedText === 'string') {
      if (value.publishedText !== part.publishedText) return false
    }
    if (part.publishedText?.contains) {
      if (
        value.publishedText == null ||
        !value.publishedText.includes(part.publishedText.contains)
      ) {
        return false
      }
    }
    if (part.publishedText?.not === null && value.publishedText == null) {
      return false
    }
    if (part.publishedText?.not === '' && !isPublished(value.publishedText)) {
      return false
    }
  }
  return true
}

function someLocale(row: KeyRow, some: any): boolean {
  return db.values.some(
    (value) => value.keyId === row.id && matchesPublishedClause(value, some)
  )
}

function filterKeys(where: any): KeyRow[] {
  return db.keys.filter((row) => {
    if (!matchRelease(row, where)) return false
    // `deliveryKey` asks for an exact key; `searchDeliveryKeys` for a substring.
    if (typeof where.key === 'string' && row.key !== where.key) return false
    if (where.key?.contains && !row.key.includes(where.key.contains)) {
      return false
    }
    if (where.locales?.some && !someLocale(row, where.locales.some)) {
      return false
    }
    if (where.NOT?.locales?.some && someLocale(row, where.NOT.locales.some)) {
      return false
    }
    return true
  })
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
      findFirst: async ({ where, select }: any) => {
        const row = filterKeys(where)[0]
        if (!row) return null
        const allowed = localeFilter(select?.locales?.where?.locale)
        return {
          key: row.key,
          locales: db.values
            .filter(
              (value) =>
                value.keyId === row.id &&
                (!allowed || allowed.includes(value.locale))
            )
            .map((value) => ({
              locale: value.locale,
              publishedText: value.publishedText,
            })),
        }
      },
      findMany: async ({ where, select, skip, take }: any) => {
        db.keyQueries++
        const rows = filterKeys(where)
          .map((row) => ({
            key: row.key,
            locales: db.values
              .filter((value) => {
                if (value.keyId !== row.id) return false
                const allowed = localeFilter(select?.locales?.where?.locale)
                return !allowed || allowed.includes(value.locale)
              })
              .map((value) => ({
                locale: value.locale,
                publishedText: value.publishedText,
              })),
          }))
          .sort((a, b) => a.key.localeCompare(b.key))
        const from = skip ?? 0
        return take == null ? rows.slice(from) : rows.slice(from, from + take)
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
  deliveryKey,
  deliveryKeyLocales,
  deliveryLocale,
  deliveryMeta,
  deliveryBundle,
  listDeliveryKeys,
  listUnpublishedDeliveryKeys,
  LIST_KEYS_DEFAULT_LIMIT,
  projectLocales,
  resolveReleaseParam,
  searchDeliveryKeys,
  searchDeliveryKeysByText,
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

describe('deliveryKey', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'en', keyId: 2, publishedText: '' },
      { locale: 'ja', keyId: 1, publishedText: 'ア' },
    ]
  })

  it('returns the published text', async () => {
    expect(await deliveryKey(1, 'a', 'en', null)).toEqual({
      state: 'published',
      text: 'A',
    })
  })

  it('tells an untranslated key apart from one that is not there', async () => {
    // An empty string for both would let a consumer render a blank where it
    // should fall back or report the gap.
    expect(await deliveryKey(1, 'b', 'en', null)).toEqual({
      state: 'unpublished',
    })
    expect(await deliveryKey(1, 'nope', 'en', null)).toEqual({ state: 'missing' })
  })

  it('calls a locale the key was never translated into unpublished', async () => {
    expect(await deliveryKey(1, 'a', 'fr', null)).toEqual({
      state: 'unpublished',
    })
  })

  it('honours the release scope', async () => {
    expect(await deliveryKey(1, 'a', 'en', 4)).toEqual({
      state: 'published',
      text: 'A',
    })
    // 'b' carries no release, so it is out of scope rather than merely empty.
    expect(await deliveryKey(1, 'b', 'en', 4)).toEqual({ state: 'missing' })
  })
})

describe('searchDeliveryKeys', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'login.title', releaseIds: [] },
      { id: 2, key: 'login.body', releaseIds: [] },
      { id: 3, key: 'logout', releaseIds: [] },
      { id: 4, key: 'login.footer', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'Sign in' },
      { locale: 'en', keyId: 2, publishedText: 'Welcome' },
      // Nothing published anywhere, so the rest of the API never names it.
      { locale: 'en', keyId: 3, publishedText: null },
      { locale: 'en', keyId: 4, publishedText: '' },
    ]
  })

  it('matches a substring of the key, in key order', async () => {
    expect(await searchDeliveryKeys(1, 'login', null)).toEqual([
      'login.body',
      'login.title',
    ])
  })

  it('leaves out keys with nothing published', async () => {
    // `logout` (no text) and `login.footer` (blank text) both drop out, so a
    // search can never name a key the bundle shapes would not.
    expect(await searchDeliveryKeys(1, 'log', null)).toEqual([
      'login.body',
      'login.title',
    ])
  })

  it('honours the release scope', async () => {
    db.keys = [{ id: 1, key: 'login.title', releaseIds: [4] }]
    expect(await searchDeliveryKeys(1, 'login', 4)).toEqual(['login.title'])
    expect(await searchDeliveryKeys(1, 'login', 5)).toEqual([])
  })
})

describe('listDeliveryKeys', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'b', releaseIds: [4] },
      { id: 2, key: 'a', releaseIds: [] },
      { id: 3, key: 'c', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'B' },
      { locale: 'en', keyId: 2, publishedText: 'A' },
      { locale: 'en', keyId: 3, publishedText: '' },
    ]
  })

  it('lists catalog keys in order and skips draft-only and blank text', async () => {
    expect(await listDeliveryKeys(1, null)).toMatchObject({
      keys: ['a', 'b'],
      total: 2,
      offset: 0,
      limit: LIST_KEYS_DEFAULT_LIMIT,
    })
  })

  it('pages by offset and reports the unpaged total', async () => {
    expect(await listDeliveryKeys(1, null, 1, 1)).toEqual({
      keys: ['b'],
      total: 2,
      offset: 1,
      limit: 1,
    })
  })

  it('honours the release scope', async () => {
    expect(await listDeliveryKeys(1, 4)).toMatchObject({
      keys: ['b'],
      total: 1,
    })
  })
})

describe('deliveryKeyLocales', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [4] },
      { id: 2, key: 'b', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'ja', keyId: 1, publishedText: '' },
      { locale: 'en', keyId: 2, publishedText: 'B' },
    ]
  })

  it('keeps unpublished locales in the map instead of omitting them', async () => {
    expect(await deliveryKeyLocales(1, 'a', null)).toEqual({
      state: 'found',
      key: 'a',
      locales: {
        en: { published: true, text: 'A' },
        ja: { published: false },
      },
    })
  })

  it('treats a blank published string as unpublished', async () => {
    const found = await deliveryKeyLocales(1, 'a', null)
    if (found.state !== 'found') throw new Error('expected found')
    expect(found.locales.ja).toEqual({ published: false })
  })

  it('is missing when the key is out of release scope, not unpublished', async () => {
    expect(await deliveryKeyLocales(1, 'b', 4)).toEqual({ state: 'missing' })
    expect(await deliveryKeyLocales(1, 'nope', null)).toEqual({
      state: 'missing',
    })
  })
})

describe('listUnpublishedDeliveryKeys', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'a', releaseIds: [] },
      { id: 2, key: 'b', releaseIds: [] },
      { id: 3, key: 'draft', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'A' },
      { locale: 'ja', keyId: 1, publishedText: 'ア' },
      { locale: 'en', keyId: 2, publishedText: 'B' },
      { locale: 'ja', keyId: 2, publishedText: '' },
      { locale: 'en', keyId: 3, publishedText: null },
    ]
  })

  it('names catalog keys that have no published text in that locale', async () => {
    expect(await listUnpublishedDeliveryKeys(1, 'ja', null)).toMatchObject({
      keys: ['b'],
      total: 1,
    })
  })

  it('does not list keys that were never published anywhere', async () => {
    const page = await listUnpublishedDeliveryKeys(1, 'en', null)
    expect(page.keys).not.toContain('draft')
    expect(page.keys).toEqual([])
  })
})

describe('searchDeliveryKeysByText', () => {
  beforeEach(() => {
    db.keys = [
      { id: 1, key: 'save', releaseIds: [] },
      { id: 2, key: 'save.as', releaseIds: [] },
      { id: 3, key: 'draft', releaseIds: [] },
    ]
    db.values = [
      { locale: 'en', keyId: 1, publishedText: 'Save' },
      { locale: 'en', keyId: 2, publishedText: 'Save as' },
      { locale: 'ja', keyId: 1, publishedText: '保存' },
      { locale: 'en', keyId: 3, publishedText: null },
    ]
  })

  it('matches exact published text in one locale', async () => {
    expect(await searchDeliveryKeysByText(1, 'en', 'Save', 'exact', null)).toEqual(
      ['save']
    )
  })

  it('matches a substring when asked', async () => {
    expect(
      await searchDeliveryKeysByText(1, 'en', 'Save', 'contains', null)
    ).toEqual(['save', 'save.as'])
  })

  it('does not search other locales', async () => {
    expect(
      await searchDeliveryKeysByText(1, 'ja', 'Save', 'exact', null)
    ).toEqual([])
    expect(
      await searchDeliveryKeysByText(1, 'ja', '保存', 'exact', null)
    ).toEqual(['save'])
  })

  it('rejects an empty query', async () => {
    await expect(
      searchDeliveryKeysByText(1, 'en', '   ', 'exact', null)
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
