import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keyDraftConflictSchema, keyWriteResultSchema } from '#shared/contract'
import { zApiV1KeyUpdate } from '#shared/schemas'
import { fpTranslation, UNNAMED_KEY_PREFIX } from '#shared/utils'
import { expectContract } from './contract'

type Value = {
  i18nKeyId: number
  locale: string
  draftText: string | null
  publishedText: string | null
  sourceFingerprint: string
}
type Key = {
  id: number
  projectId: number
  key: string
  fingerprint: string
  releaseIds?: number[]
}

const db = vi.hoisted(() => ({
  keys: [] as Key[],
  values: [] as Value[],
  logs: [] as { action: string; status: string }[],
  nextId: 100,
}))

function loadKey(row: Key | undefined) {
  if (!row) return null
  return {
    ...row,
    releases: (row.releaseIds ?? []).map((releaseId) => ({ releaseId })),
    locales: db.values.filter((value) => value.i18nKeyId === row.id),
  }
}

function findKey(where: any) {
  if (where.id !== undefined) return db.keys.find((row) => row.id === where.id)
  const { projectId, key } = where.projectId_key
  return db.keys.find((row) => row.projectId === projectId && row.key === key)
}

vi.mock('#server/libs/prisma', () => ({
  default: {
    projectSettings: {
      findUnique: async () => ({ localeFallback: 'en', locales: ['en', 'ja'] }),
    },
    i18nKey: {
      findUnique: async ({ where }: any) => loadKey(findKey(where)),
      findUniqueOrThrow: async ({ where }: any) => loadKey(findKey(where))!,
      create: async ({ data: { releases, ...data } }: any) => {
        const row = {
          id: db.nextId++,
          ...data,
          releaseIds: releases ? [releases.create.releaseId] : [],
        }
        db.keys.push(row)
        return row
      },
      update: async ({ where, data }: any) =>
        Object.assign(findKey(where)!, data),
    },
    localeValue: {
      findUnique: async ({ where }: any) => {
        const { i18nKeyId, locale } = where.i18nKeyId_locale
        return (
          db.values.find(
            (v) => v.i18nKeyId === i18nKeyId && v.locale === locale,
          ) ?? null
        )
      },
      upsert: async ({ where, create, update }: any) => {
        const { i18nKeyId, locale } = where.i18nKeyId_locale
        const found = db.values.find(
          (v) => v.i18nKeyId === i18nKeyId && v.locale === locale,
        )
        if (found) return Object.assign(found, update)
        const row = { sourceFingerprint: '', ...create }
        db.values.push(row)
        return row
      },
    },
    translationLog: {
      create: async ({ data }: any) => db.logs.push(data),
    },
    projectRelease: {
      findMany: async () => [{ id: 5 }],
    },
  },
}))

const { createKeyFromSource, updateKeyDrafts, writeClientOf } =
  await import('#server/helper/api-key-write')

const v = (
  i18nKeyId: number,
  locale: string,
  draftText: string | null,
  publishedText: string | null,
  sourceFingerprint = '',
): Value => ({ i18nKeyId, locale, draftText, publishedText, sourceFingerprint })

beforeEach(() => {
  db.nextId = 100
  db.logs = []
  db.keys = [
    {
      id: 1,
      projectId: 1,
      key: 'home.title',
      fingerprint: fpTranslation('Hello'),
    },
  ]
  db.values = [
    v(1, 'en', 'Hello', 'Hello'),
    v(1, 'ja', 'こんにちは', 'こんにちは', fpTranslation('Hello')),
  ]
})

describe('createKeyFromSource', () => {
  it('creates a named key and publishes its source text', async () => {
    const result = await createKeyFromSource({
      projectId: 1,
      userId: 7,
      key: 'home.cta',
      sourceText: '  Buy now ',
    })
    expectContract(keyWriteResultSchema, result)
    expect(result.created).toBe(true)
    expect(result.key.key).toBe('home.cta')
    expect(result.key.locales.en).toEqual({
      draftText: 'Buy now',
      publishedText: 'Buy now',
      state: 'published',
    })
    expect(result.key.locales.ja?.state).toBe('unpublished')
    expect(db.logs).toMatchObject([
      { action: 'CREATE', status: 'SUCCESS', userID: 7 },
    ])
  })

  it('reuses the unnamed key of the same text and keeps it a draft', async () => {
    const first = await createKeyFromSource({
      projectId: 1,
      userId: 7,
      sourceText: 'Buy',
    })
    expect(first.key.key).toBe(`${UNNAMED_KEY_PREFIX}${fpTranslation('Buy')}`)
    expect(first.key.locales.en?.publishedText).toBeNull()
    const second = await createKeyFromSource({
      projectId: 1,
      userId: 7,
      sourceText: 'Buy',
    })
    expect(second.created).toBe(false)
    expect(second.key.id).toBe(first.key.id)
    expect(db.keys).toHaveLength(2)
  })

  it('labels a key it creates, never a reused one, and refuses a foreign release', async () => {
    const created = await createKeyFromSource({
      projectId: 1,
      userId: 7,
      key: 'home.cta',
      sourceText: 'Buy now',
      releaseId: 5,
    })
    expect(created.key.releaseIds).toEqual([5])
    await createKeyFromSource({ projectId: 1, userId: 7, sourceText: 'Buy' })
    const reused = await createKeyFromSource({
      projectId: 1,
      userId: 7,
      sourceText: 'Buy',
      releaseId: 5,
    })
    expect(reused.created).toBe(false)
    expect(reused.key.releaseIds).toEqual([])
    await expect(
      createKeyFromSource({
        projectId: 1,
        userId: 7,
        key: 'home.other',
        sourceText: 'Other',
        releaseId: 9,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(db.keys).toHaveLength(3)
  })

  it('refuses a name the project has, and the reserved prefix', async () => {
    await expect(
      createKeyFromSource({
        projectId: 1,
        userId: 7,
        key: 'home.title',
        sourceText: 'Hi',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(db.logs).toMatchObject([{ status: 'REFUSED' }])
    await expect(
      createKeyFromSource({
        projectId: 1,
        userId: 7,
        key: `${UNNAMED_KEY_PREFIX}x`,
        sourceText: 'Hi',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('writeClientOf', () => {
  it('reads the tool and the agent flag from the header', () => {
    expect(writeClientOf('cli/0.1.0; agent')).toEqual({
      client: 'cli/0.1.0',
      agent: true,
    })
    expect(writeClientOf(' vscode/0.4.2 ')).toEqual({
      client: 'vscode/0.4.2',
      agent: false,
    })
  })

  it('records nothing for a missing or malformed header', () => {
    const none = { client: null, agent: false }
    expect(writeClientOf(undefined)).toEqual(none)
    expect(writeClientOf('cli')).toEqual(none)
    expect(writeClientOf('cli/1.0; robot')).toEqual(none)
    expect(writeClientOf(`cli/${'9'.repeat(40)}`)).toEqual(none)
  })
})

describe('updateKeyDrafts', () => {
  it('edits a published key as a draft and keeps it served', async () => {
    const result = await updateKeyDrafts({
      projectId: 1,
      userId: 7,
      via: { client: 'cli/0.1.0', agent: true },
      key: 'home.title',
      locales: { ja: { text: 'やあ', expected: 'こんにちは' } },
    })
    expectContract(keyWriteResultSchema, result)
    expect(result.key.draft).toBe(true)
    expect(result.key.locales.ja).toEqual({
      draftText: 'やあ',
      publishedText: 'こんにちは',
      state: 'draft',
    })
    expect(db.logs).toMatchObject([
      { action: 'UPDATE', status: 'SUCCESS', client: 'cli/0.1.0', agent: true },
    ])
  })

  it('refuses the whole request when any expected draft is stale', async () => {
    const error = await updateKeyDrafts({
      projectId: 1,
      userId: 7,
      key: 'home.title',
      locales: {
        en: { text: 'Hi', expected: 'Hello' },
        ja: { text: 'やあ', expected: 'old' },
      },
    }).catch((caught) => caught)
    expect(error.statusCode).toBe(409)
    expectContract(keyDraftConflictSchema, error.data)
    expect(error.data.locales).toEqual(['ja'])
    expect(db.values.find((x) => x.locale === 'en')!.draftText).toBe('Hello')
    expect(db.logs).toEqual([])
  })

  it('re-fingerprints on a source change, leaving untouched translations stale', async () => {
    const result = await updateKeyDrafts({
      projectId: 1,
      userId: 7,
      key: 'home.title',
      locales: { en: { text: ' Hello there ', expected: 'Hello' } },
    })
    expect(db.keys[0]!.fingerprint).toBe(fpTranslation('Hello there'))
    expect(result.key.locales.en?.draftText).toBe('Hello there')
    // Flagged outdated once published; a draft key is never outdated.
    expect(db.values.find((x) => x.locale === 'ja')!.sourceFingerprint).toBe(
      fpTranslation('Hello'),
    )
  })

  it('stamps translations sent with the new source against it', async () => {
    const result = await updateKeyDrafts({
      projectId: 1,
      userId: 7,
      key: 'home.title',
      locales: {
        en: { text: 'Hello there', expected: 'Hello' },
        ja: { text: 'こんにちは、そこ', expected: 'こんにちは' },
      },
    })
    expect(db.values.find((x) => x.locale === 'ja')!.sourceFingerprint).toBe(
      fpTranslation('Hello there'),
    )
    expect(result.key.locales.ja?.state).toBe('draft')
  })

  it('rejects an unknown key, an unknown locale and an empty source', async () => {
    const base = { projectId: 1, userId: 7 }
    await expect(
      updateKeyDrafts({
        ...base,
        key: 'nope',
        locales: { ja: { text: 'x', expected: '' } },
      }),
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(
      updateKeyDrafts({
        ...base,
        key: 'home.title',
        locales: { fr: { text: 'x', expected: '' } },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(
      updateKeyDrafts({
        ...base,
        key: 'home.title',
        locales: { en: { text: '  ', expected: 'Hello' } },
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('writes nothing when every text is unchanged', async () => {
    const result = await updateKeyDrafts({
      projectId: 1,
      userId: 7,
      key: 'home.title',
      locales: { ja: { text: 'こんにちは', expected: 'こんにちは' } },
    })
    expect(result.key.draft).toBe(false)
    expect(db.logs).toEqual([])
  })

  it('needs at least one locale in the body', () => {
    expect(zApiV1KeyUpdate.safeParse({ key: 'a', locales: {} }).success).toBe(
      false,
    )
  })
})
