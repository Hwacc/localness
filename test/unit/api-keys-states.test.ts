import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deliveryKeyStatesSchema } from '#shared/contract'
import { expectContract } from './contract'

type Value = {
  locale: string
  draftText: string | null
  publishedText: string | null
  sourceFingerprint: string
}
type Key = {
  id: number
  key: string
  fingerprint: string
  releaseIds: number[]
  locales: Value[]
}

const db = vi.hoisted(() => ({
  keys: [] as Key[],
  namespaceIds: null as number[] | null,
  authError: null as Error | null,
  query: {} as Record<string, unknown>,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    projectSettings: {
      findUnique: async () => ({ localeFallback: 'en', locales: ['en', 'ja', 'fr'] }),
    },
    projectRelease: { findFirst: async () => ({ id: 4 }) },
    keyNamespace: { findFirst: async () => null },
    i18nKey: {
      count: async ({ where }: any) => filter(where).length,
      findMany: async ({ where, skip, take }: any) =>
        filter(where)
          .sort((a, b) => a.key.localeCompare(b.key))
          .slice(skip, skip + take)
          .map((row) => ({
            ...row,
            releases: row.releaseIds.map((releaseId) => ({ releaseId })),
          })),
    },
  },
}))

vi.mock('#server/helper/api-token', () => ({
  authenticateDeliveryRequest: async () => {
    if (db.authError) throw db.authError
    return { id: 1, createdBy: 1 }
  },
  touchApiToken: async () => {},
}))

vi.mock('#server/helper/api-token-project', () => ({
  resolveTokenProject: async (_token: unknown, raw: unknown) => {
    if (raw === 'other') {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    return 1
  },
}))

vi.mock('#server/helper/namespace', () => ({
  listNamespaces: async () => [],
  namespaceKeyIds: async () => db.namespaceIds ?? [],
}))

function filter(where: any): Key[] {
  return db.keys.filter((row) => {
    const some = where.releases?.some
    if (some && !row.releaseIds.includes(some.releaseId)) return false
    if (where.id?.in && !where.id.in.includes(row.id)) return false
    return true
  })
}

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRequestHeader', () => 'Bearer lns_x')
vi.stubGlobal('getQuery', () => db.query)

const handler = (await import('#server/api/v1/keys/states.get')).default as (
  event: unknown
) => Promise<any>
const run = (query: Record<string, unknown> = {}) => {
  db.query = query
  return handler({})
}

const v = (
  locale: string,
  draftText: string | null,
  publishedText: string | null,
  sourceFingerprint = ''
): Value => ({ locale, draftText, publishedText, sourceFingerprint })

beforeEach(() => {
  db.authError = null
  db.namespaceIds = null
  db.keys = [
    {
      id: 1,
      key: 'a.published',
      fingerprint: 'f1',
      releaseIds: [4],
      locales: [v('en', 'Hi', 'Hi'), v('ja', 'こんにちは', 'こんにちは', 'f1')],
    },
    {
      id: 2,
      key: 'b.outdated',
      fingerprint: 'f2-new',
      releaseIds: [],
      locales: [v('en', 'Bye', 'Bye'), v('ja', 'さよなら', 'さよなら', 'f2-old')],
    },
    {
      id: 3,
      key: 'c.draft',
      fingerprint: 'f3',
      releaseIds: [4],
      locales: [v('en', 'New', null), v('ja', '', '')],
    },
    {
      id: 4,
      key: 'd.edited',
      fingerprint: 'f4',
      releaseIds: [],
      locales: [v('en', 'Edited', 'Old'), v('ja', 'x', 'x', 'f4')],
    },
  ]
})

describe('GET /api/v1/keys/states', () => {
  it('matches the contract and orders by key', async () => {
    const result = await run()
    expectContract(deliveryKeyStatesSchema, result)
    expect(result.sourceLocale).toBe('en')
    expect(result.keys.map((k: any) => k.key)).toEqual([
      'a.published',
      'b.outdated',
      'c.draft',
      'd.edited',
    ])
    expect(result).toMatchObject({ total: 4, offset: 0, limit: 1000 })
    expect(Object.keys(result.keys[0].locales)).toEqual(['en', 'ja', 'fr'])
  })

  it('derives draft, outdated, unpublished and published', async () => {
    const { keys } = await run()
    const [a, b, c, d] = keys
    expect(a.draft).toBe(false)
    expect(a.locales.ja.state).toBe('published')
    expect(b.draft).toBe(false)
    expect(b.locales.ja.state).toBe('outdated')
    expect(c.draft).toBe(true)
    expect(c.locales.en).toEqual({ draftText: 'New', publishedText: null, state: 'unpublished' })
    expect(c.locales.ja.state).toBe('unpublished')
    expect(d.draft).toBe(true)
    expect(d.locales.en.state).toBe('draft')
  })

  it('reports a locale with no row as unpublished with null texts', async () => {
    const { keys } = await run()
    expect(keys[0].locales.fr).toEqual({
      draftText: null,
      publishedText: null,
      state: 'unpublished',
    })
  })

  it('honours the locales filter', async () => {
    const { keys } = await run({ locales: 'ja, en' })
    expect(Object.keys(keys[0].locales)).toEqual(['ja', 'en'])
  })

  it('pages and clamps the limit', async () => {
    const page = await run({ offset: '1', limit: '2' })
    expect(page.keys.map((k: any) => k.key)).toEqual(['b.outdated', 'c.draft'])
    expect(page).toMatchObject({ total: 4, offset: 1, limit: 2 })
    expect((await run({ limit: '999999' })).limit).toBe(5000)
  })

  it('scopes by release and namespace', async () => {
    const byRelease = await run({ release: '4' })
    expect(byRelease.keys.map((k: any) => k.id)).toEqual([1, 3])
    expect(byRelease.keys[0].releaseIds).toEqual([4])

    db.namespaceIds = [2, 3]
    const byNamespace = await run({ namespace: '__ungrouped__' })
    expect(byNamespace.keys.map((k: any) => k.id)).toEqual([2, 3])
    expect(byNamespace.total).toBe(2)
  })

  it('rejects a bad token and a project the token cannot reach', async () => {
    await expect(run({ project: 'other' })).rejects.toMatchObject({ statusCode: 403 })
    db.authError = Object.assign(new Error('Unauthorized'), { statusCode: 401 })
    await expect(run()).rejects.toMatchObject({ statusCode: 401 })
  })

  it('works for a read token', async () => {
    await expect(run()).resolves.toBeDefined()
  })
})
