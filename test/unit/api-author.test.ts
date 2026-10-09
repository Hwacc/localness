import { beforeEach, describe, expect, it, vi } from 'vitest'
import { matchAuthorTexts, type AuthorSourceRow } from '#server/helper/api-author'

const row = (overrides: Partial<AuthorSourceRow> & Pick<AuthorSourceRow, 'id' | 'key'>): AuthorSourceRow => ({
  draftText: null,
  publishedText: null,
  releaseIds: [],
  ...overrides,
})

describe('matchAuthorTexts', () => {
  it('matches a unique draft and a unique published sentence', () => {
    const result = matchAuthorTexts(
      [
        row({ id: 1, key: 'save', draftText: 'Save', releaseIds: [3] }),
        row({ id: 2, key: 'done', publishedText: 'Done' }),
      ],
      ['Save', 'Done', 'Missing']
    )
    expect(result.matches[0]?.keys.map((hit) => hit.key)).toEqual(['save'])
    expect(result.matches[0]?.keys[0]).toMatchObject({ draft: true, sourceText: 'Save', releaseIds: [3] })
    expect(result.matches[1]?.keys[0]).toMatchObject({ key: 'done', draft: false })
    expect(result.matches[2]?.keys).toEqual([])
  })

  it('prefers the draft when both sides exist, and keeps every ambiguous hit', () => {
    const result = matchAuthorTexts(
      [
        row({ id: 1, key: 'a', draftText: 'Hello', publishedText: 'Old' }),
        row({ id: 2, key: 'b', draftText: 'Hello' }),
      ],
      ['Hello', 'Old']
    )
    expect(result.matches[0]?.keys.map((hit) => hit.key).sort()).toEqual(['a', 'b'])
    expect(result.matches[1]?.keys).toEqual([])
  })

  it('ignores line breaks when comparing', () => {
    const result = matchAuthorTexts([row({ id: 1, key: 'wrap', draftText: 'Sign in' })], ['Sign\n  in'])
    expect(result.matches[0]?.keys.map((hit) => hit.key)).toEqual(['wrap'])
  })
})

type KeyRow = { id: number; projectId: number; key: string; fingerprint: string }
type LocaleRow = {
  i18nKeyId: number
  locale: string
  draftText: string | null
  publishedText: string | null
}

const db = vi.hoisted(() => ({
  keys: [] as KeyRow[],
  locales: [] as LocaleRow[],
  releases: [] as Array<{ i18nKeyId: number; releaseId: number }>,
  pageReleases: [] as Array<{ pageId: number; releaseId: number }>,
  projectReleaseIds: [] as number[],
  ownerUserId: null as number | null,
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => {
  const client: any = {
    project: {
      findUnique: async () => ({
        id: 7,
        settings: { localeFallback: 'en', ocrLanguage: 'eng', ocrEngine: 1 },
      }),
    },
    projectRelease: {
      findMany: async () => db.projectReleaseIds.map((id) => ({ id })),
      findFirst: async ({ where }: any) =>
        db.projectReleaseIds.includes(where.id) ? { id: where.id } : null,
    },
    projectOwner: {
      findUnique: async () => (db.ownerUserId == null ? null : { userId: db.ownerUserId }),
    },
    page: {
      findFirst: async () => ({ id: 12, name: 'Home', image: 'shot.png', projectID: 7 }),
      create: async ({ data }: any) => ({ id: 12, name: data.name, image: data.image }),
      update: async ({ data }: any) => data,
    },
    pageSettings: { create: async ({ data }: any) => data },
    pageRelease: {
      findMany: async () => db.pageReleases,
      create: async ({ data }: any) => {
        db.pageReleases.push(data)
        return data
      },
      createMany: async ({ data }: any) => {
        db.pageReleases.push(...data)
        return { count: data.length }
      },
    },
    i18nKey: {
      findMany: async ({ where }: any) => {
        const wanted: string[] | undefined = where?.key?.in
        return db.keys.filter(
          (row) => row.projectId === (where?.projectId ?? row.projectId) && (!wanted || wanted.includes(row.key))
        )
      },
      create: async ({ data }: any) => {
        const row: KeyRow = { id: db.nextId++, ...data }
        db.keys.push(row)
        return row
      },
    },
    i18nKeyRelease: {
      findMany: async () => db.releases,
      create: async ({ data }: any) => {
        db.releases.push(data)
        return data
      },
      createMany: async ({ data }: any) => {
        db.releases.push(...data)
        return { count: data.length }
      },
    },
    localeValue: {
      upsert: async ({ create }: any) => {
        db.locales.push(create)
        return create
      },
    },
    tag: {
      findMany: async () => [],
      create: async ({ data }: any) => ({ id: db.nextId++, ...data }),
      update: async ({ data }: any) => data,
    },
    tagSettings: { create: async ({ data }: any) => data },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  }
  return { default: client }
})

const { createPageWithTags, upsertPageWithTags } = await import('#server/helper/api-write')
const { assertTokenManagesReleases } = await import('#server/helper/api-author')

beforeEach(() => {
  db.keys = []
  db.locales = []
  db.releases = []
  db.pageReleases = []
  db.projectReleaseIds = [4]
  db.ownerUserId = null
  db.nextId = 1
})

describe('authoring writes', () => {
  it('creates a draft key and does not publish it', async () => {
    const result = await createPageWithTags({
      projectId: 7,
      name: 'Home',
      image: 'shot.png',
      releaseId: 4,
      tags: [
        {
          figmaNodeId: '1:1',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          i18nKey: null,
          keyName: 'home.save',
          sourceText: 'Save',
          labelRelease: true,
        },
      ],
    })

    expect(result.tags[0]).toMatchObject({ i18nKey: 'home.save', i18nKeyId: 1 })
    expect(db.locales[0]).toMatchObject({ draftText: 'Save', publishedText: null, locale: 'en' })
    expect(db.releases).toEqual([{ i18nKeyId: 1, releaseId: 4 }])
    expect(db.pageReleases).toEqual([{ pageId: 12, releaseId: 4 }])
  })

  it('updates the draft of an existing key instead of leaving the source alone', async () => {
    db.keys.push({ id: 9, projectId: 7, key: 'home.save', fingerprint: '' })
    await createPageWithTags({
      projectId: 7,
      name: 'Home',
      image: 'shot.png',
      tags: [
        {
          figmaNodeId: '1:1',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          i18nKey: null,
          keyName: 'home.save',
          sourceText: 'Save',
        },
      ],
    })
    expect(db.keys).toHaveLength(1)
    expect(db.locales[0]).toMatchObject({
      i18nKeyId: 9,
      draftText: 'Save',
      publishedText: null,
    })
    expect(db.releases).toEqual([])
  })

  it('writes a placeholder key when no name was given, and reuses it for the same sentence', async () => {
    const { fpTranslation, DRAFT_KEY_PREFIX } = await import('#shared/utils')
    const key = `${DRAFT_KEY_PREFIX}${fpTranslation('Save')}`
    const first = await createPageWithTags({
      projectId: 7,
      name: 'Home',
      image: 'shot.png',
      tags: [
        {
          figmaNodeId: '1:1',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          i18nKey: null,
          sourceText: 'Save',
        },
      ],
    })
    expect(first.tags[0]?.i18nKey).toBe(key)
    const second = await createPageWithTags({
      projectId: 7,
      name: 'Home',
      image: 'shot.png',
      tags: [
        {
          figmaNodeId: '1:2',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          i18nKey: null,
          sourceText: 'Save',
        },
      ],
    })
    expect(second.tags[0]?.i18nKeyId).toBe(first.tags[0]?.i18nKeyId)
    expect(db.keys).toHaveLength(1)
  })

  it('updates draft source on an existing tag and does not publish it', async () => {
    const existing = {
      id: 3,
      pageID: 12,
      figmaNodeId: '1:1',
      i18nKey: 'kept',
      i18nKeyId: 9,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }
    const prisma = (await import('#server/libs/prisma')).default as any
    db.keys.push({ id: 9, projectId: 7, key: 'kept', fingerprint: '' })
    prisma.tag.findMany = async () => [existing]
    let updated: Record<string, unknown> | null = null
    prisma.tag.update = async ({ data }: any) => {
      updated = data
      return data
    }

    await upsertPageWithTags({
      projectId: 7,
      pageId: 12,
      tags: [
        {
          figmaNodeId: '1:1',
          x: 5,
          y: 6,
          width: 7,
          height: 8,
          i18nKey: 'kept',
          sourceText: 'Nope',
        },
      ],
    })

    expect(updated).toMatchObject({ x: 5, y: 6, width: 7, height: 8, i18nKey: 'kept', i18nKeyId: 9 })
    expect(db.locales[0]).toMatchObject({ i18nKeyId: 9, draftText: 'Nope', publishedText: null })
    expect(db.keys.find((key) => key.key === 'replaced')).toBeUndefined()
  })

  it('keeps a draft key the request named instead of hashing the layer text', async () => {
    const { fpTranslation, DRAFT_KEY_PREFIX } = await import('#shared/utils')
    const requested = `${DRAFT_KEY_PREFIX}${fpTranslation('test')}`
    const fromText = `${DRAFT_KEY_PREFIX}${fpTranslation('Hello')}`
    const existing = {
      id: 3,
      pageID: 12,
      figmaNodeId: '1:1',
      i18nKey: fromText,
      i18nKeyId: 8,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }
    const prisma = (await import('#server/libs/prisma')).default as any
    db.keys.push({ id: 8, projectId: 7, key: fromText, fingerprint: '' })
    db.keys.push({ id: 15, projectId: 7, key: requested, fingerprint: '' })
    prisma.tag.findMany = async () => [existing]
    let updated: Record<string, unknown> | null = null
    prisma.tag.update = async ({ data }: any) => {
      updated = data
      return data
    }

    await upsertPageWithTags({
      projectId: 7,
      pageId: 12,
      tags: [
        {
          figmaNodeId: '1:1',
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          i18nKey: requested,
          sourceText: 'Hello',
        },
      ],
    })

    expect(updated).toMatchObject({ i18nKey: requested, i18nKeyId: 15 })
  })
})

describe('assertTokenManagesReleases', () => {
  it('refuses someone who is not a project owner', async () => {
    await expect(assertTokenManagesReleases(1, 7)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows a project owner', async () => {
    db.ownerUserId = 1
    await expect(assertTokenManagesReleases(1, 7)).resolves.toBeUndefined()
  })
})
