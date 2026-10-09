import { beforeEach, describe, expect, it, vi } from 'vitest'

type PageRow = { id: number; name: string; image: string | null; projectID: number | null }
type KeyRow = { id: number; projectId: number; key: string }
type TagRow = {
  id: number
  pageID: number
  tagID: string
  className: string
  x: number
  y: number
  width: number
  height: number
  figmaNodeId: string | null
  i18nKey: string | null
  i18nKeyId: number | null
}
type SettingsRow = { tagID: number; locked: boolean; style: unknown; labelStyle: unknown }

const db = vi.hoisted(() => ({
  projects: [] as Array<{
    id: number
    settings: { ocrLanguage: string; ocrEngine: number } | null
  }>,
  pages: [] as PageRow[],
  keys: [] as KeyRow[],
  tags: [] as TagRow[],
  tagSettings: [] as SettingsRow[],
  /** Writes seen, so a test can assert what a path did NOT touch. */
  calls: [] as string[],
  writes: [] as Array<{ model: string; data: Record<string, unknown> }>,
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => {
  const client: any = {
    project: {
      findUnique: async ({ where }: any) => {
        db.calls.push('project.findUnique')
        return db.projects.find((row) => row.id === where.id) ?? null
      },
    },
    page: {
      findFirst: async ({ where }: any) => {
        db.calls.push('page.findFirst')
        return (
          db.pages.find(
            (row) =>
              row.id === where.id &&
              (where.projectID == null || row.projectID === where.projectID)
          ) ?? null
        )
      },
      create: async ({ data }: any) => {
        db.calls.push('page.create')
        db.writes.push({ model: 'page', data })
        const row: PageRow = {
          id: db.nextId++,
          name: data.name,
          image: data.image ?? null,
          projectID: data.projectID,
        }
        db.pages.push(row)
        return row
      },
      update: async ({ where, data }: any) => {
        db.calls.push('page.update')
        db.writes.push({ model: 'page', data })
        const row = db.pages.find((page) => page.id === where.id)!
        Object.assign(row, data)
        return row
      },
    },
    pageSettings: {
      create: async ({ data }: any) => {
        db.calls.push('pageSettings.create')
        db.writes.push({ model: 'pageSettings', data })
        return data
      },
    },
    i18nKey: {
      findMany: async ({ where }: any) => {
        db.calls.push('i18nKey.findMany')
        const wanted: string[] = where.key?.in ?? []
        return db.keys.filter(
          (row) => row.projectId === where.projectId && wanted.includes(row.key)
        )
      },
      create: async () => {
        throw new Error('importing must never create an i18n key')
      },
    },
    tag: {
      findMany: async ({ where }: any) => {
        db.calls.push('tag.findMany')
        return db.tags.filter((row) => {
          if (where.pageID != null && row.pageID !== where.pageID) return false
          if (where.figmaNodeId?.not === null && row.figmaNodeId === null) return false
          if (where.id?.in && !where.id.in.includes(row.id)) return false
          return true
        })
      },
      create: async ({ data }: any) => {
        db.calls.push('tag.create')
        db.writes.push({ model: 'tag', data })
        const row: TagRow = { id: db.nextId++, ...data }
        db.tags.push(row)
        return row
      },
      update: async ({ where, data }: any) => {
        db.calls.push('tag.update')
        db.writes.push({ model: 'tag', data })
        const row = db.tags.find((tag) => tag.id === where.id)!
        Object.assign(row, data)
        return row
      },
      deleteMany: async ({ where }: any) => {
        db.calls.push('tag.deleteMany')
        const ids: number[] = where.id?.in ?? []
        const before = db.tags.length
        db.tags = db.tags.filter(
          (row) =>
            !(ids.includes(row.id) && (where.pageID == null || row.pageID === where.pageID))
        )
        return { count: before - db.tags.length }
      },
    },
    tagSettings: {
      create: async ({ data }: any) => {
        db.calls.push('tagSettings.create')
        db.writes.push({ model: 'tagSettings', data })
        db.tagSettings.push(data)
        return data
      },
    },
    /** Interactive transaction: the callback gets the same mocked client. */
    $transaction: async (fn: (tx: unknown) => unknown) => {
      db.calls.push('$transaction')
      return fn(client)
    },
  }
  return { default: client }
})

const {
  assertPageInProject,
  createPageWithTags,
  deletePageTags,
  listPageTags,
  resolveKeyIds,
  upsertPageWithTags,
} = await import('#server/helper/api-write')

beforeEach(() => {
  db.projects = []
  db.pages = []
  db.keys = []
  db.tags = []
  db.tagSettings = []
  db.calls = []
  db.writes = []
  db.nextId = 1
})

const PROJECT = 7
/** A page in another project, to prove the scoping is not decorative. */
const OTHER_PROJECT = 99

function seedPage(id = 12, projectID: number | null = PROJECT) {
  const row: PageRow = { id, name: 'Home', image: 'shot.png', projectID }
  db.pages.push(row)
  return row
}

function seedKey(id: number, key: string, projectId = PROJECT) {
  db.keys.push({ id, projectId, key })
  return id
}

function seedTag(overrides: Partial<TagRow> & { id?: number } = {}) {
  const row: TagRow = {
    id: overrides.id ?? db.nextId++,
    pageID: overrides.pageID ?? 12,
    tagID: overrides.tagID ?? '1:2',
    className: overrides.className ?? 'tag',
    x: overrides.x ?? 1,
    y: overrides.y ?? 2,
    width: overrides.width ?? 3,
    height: overrides.height ?? 4,
    figmaNodeId: overrides.figmaNodeId === undefined ? '1:2' : overrides.figmaNodeId,
    i18nKey: overrides.i18nKey ?? null,
    i18nKeyId: overrides.i18nKeyId ?? null,
  }
  db.tags.push(row)
  return row
}

function desired(overrides: Record<string, unknown> = {}) {
  return {
    figmaNodeId: '1:2',
    x: 10,
    y: 20,
    width: 80,
    height: 24,
    i18nKey: null,
    ...overrides,
  } as any
}

describe('assertPageInProject', () => {
  it('resolves a page of this project', async () => {
    seedPage()
    await expect(assertPageInProject(12, PROJECT)).resolves.toMatchObject({ id: 12 })
  })

  it('404s a page of another project rather than 403ing it', async () => {
    // A 403 would confirm the page exists, which is a fact this credential has
    // no business learning.
    seedPage(12, OTHER_PROJECT)
    await expect(assertPageInProject(12, PROJECT)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('404s a page with no project at all', async () => {
    seedPage(12, null)
    await expect(assertPageInProject(12, PROJECT)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('resolveKeyIds', () => {
  it('maps the keys that exist', async () => {
    seedKey(200, 'home.title')
    const map = await resolveKeyIds(PROJECT, ['home.title'])
    expect(map.get('home.title')).toBe(200)
  })

  it('omits an unknown name instead of inventing a key', async () => {
    // The importer only ever sends names it read from published copy, so a miss
    // means the caller drifted — never a reason to create anything.
    const map = await resolveKeyIds(PROJECT, ['home.title'])
    expect(map.has('home.title')).toBe(false)
    expect(db.calls).not.toContain('i18nKey.create')
  })

  it('ignores null and empty names, and asks for nothing when there are none', async () => {
    expect((await resolveKeyIds(PROJECT, [null, undefined, ''])).size).toBe(0)
    expect(db.calls).not.toContain('i18nKey.findMany')
  })

  it('does not reach into another project', async () => {
    seedKey(200, 'home.title', OTHER_PROJECT)
    const map = await resolveKeyIds(PROJECT, ['home.title'])
    expect(map.size).toBe(0)
  })

  it('deduplicates the lookup', async () => {
    seedKey(200, 'home.title')
    const map = await resolveKeyIds(PROJECT, ['home.title', 'home.title'])
    expect(map.size).toBe(1)
  })
})

describe('createPageWithTags', () => {
  it('writes the geometry through unchanged, as image pixels', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    const result = await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired({ x: 10.5, y: 20.25, width: 80, height: 24 })],
    })

    expect(result.tags[0]).toMatchObject({ x: 10.5, y: 20.25, width: 80, height: 24 })
  })

  it('stamps the same className the editor draws with', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired()],
    })
    expect(db.tags[0]!.className).toBe('tag')
  })

  it('binds a key that exists and leaves an unknown one unbound', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    seedKey(200, 'home.title')
    const result = await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired({ figmaNodeId: '1:1', i18nKey: 'home.title' }), desired({ figmaNodeId: '1:2', i18nKey: 'nope' })],
    })

    expect(result.tags[0]).toMatchObject({ i18nKey: 'home.title', i18nKeyId: 200 })
    expect(result.tags[1]).toMatchObject({ i18nKey: null, i18nKeyId: null })
  })

  it('leaves the key unbound when none was sent at all', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    const result = await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired()],
    })
    expect(result.tags[0]).toMatchObject({ i18nKey: null, i18nKeyId: null })
  })

  it('gives every tag a settings row, because style has no database default', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired({ figmaNodeId: '1:1' }), desired({ figmaNodeId: '1:2' })],
    })
    expect(db.tagSettings).toHaveLength(2)
    expect(db.tagSettings[0]).toMatchObject({ locked: false, style: {}, labelStyle: {} })
  })

  it('inherits the project OCR settings and leaves the key convention null', async () => {
    // Null is how a page keeps following the project's convention instead of
    // freezing today's values into it.
    db.projects.push({
      id: PROJECT,
      settings: { ocrLanguage: 'jpn', ocrEngine: 2 },
    })
    await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [],
    })
    const settings = db.writes.find((write) => write.model === 'pageSettings')!.data as any
    expect(settings).toMatchObject({
      ocrLanguage: 'jpn',
      ocrEngine: 2,
      keyPrefix: null,
      keySeparator: null,
      keyStyle: null,
      keyMaxDepth: null,
    })
  })

  it('lands the page and its tags in one transaction', async () => {
    db.projects.push({ id: PROJECT, settings: null })
    await createPageWithTags({
      projectId: PROJECT,
      name: 'Home',
      image: 'shot.png',
      tags: [desired()],
    })
    expect(db.calls).toContain('$transaction')
  })

  it('404s a project that does not exist', async () => {
    await expect(
      createPageWithTags({ projectId: PROJECT, name: 'Home', image: 's.png', tags: [] })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('upsertPageWithTags', () => {
  it('updates the geometry of a tag whose node is already on the page', async () => {
    seedPage()
    const tag = seedTag({ figmaNodeId: '1:2' })
    const result = await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      tags: [desired({ x: 111, y: 222 })],
    })

    expect(result).toMatchObject({ created: 0, updated: 1 })
    expect(db.tags.find((row) => row.id === tag.id)).toMatchObject({ x: 111, y: 222 })
  })

  it('follows the key named in the request when that key exists', async () => {
    seedPage()
    seedTag({ figmaNodeId: '1:2', i18nKey: 'picked.by.hand', i18nKeyId: 55 })
    seedKey(200, 'home.title')

    await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      tags: [desired({ i18nKey: 'home.title' })],
    })

    expect(db.tags[0]).toMatchObject({
      i18nKey: 'home.title',
      i18nKeyId: 200,
    })
  })

  it('creates the tags whose node is new', async () => {
    seedPage()
    const result = await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      tags: [desired({ figmaNodeId: '9:9', x: 5 })],
    })
    expect(result).toMatchObject({ created: 1, updated: 0 })
    expect(db.tags[0]).toMatchObject({ figmaNodeId: '9:9', x: 5, className: 'tag' })
  })

  it('reports a tag whose node is gone as stale, and does not delete it', async () => {
    seedPage()
    const kept = seedTag({ figmaNodeId: '1:2' })
    const orphan = seedTag({ figmaNodeId: '1:3' })

    const result = await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      tags: [desired({ figmaNodeId: '1:2' })],
    })

    expect(result.stale.map((tag) => tag.figmaNodeId)).toEqual(['1:3'])
    expect(db.calls).not.toContain('tag.deleteMany')
    expect(db.tags.map((row) => row.id).sort()).toEqual([kept.id, orphan.id].sort())
  })

  it('never counts a hand-drawn tag as stale', async () => {
    // Tags the editor drew have no node id and were never part of an import.
    seedPage()
    seedTag({ figmaNodeId: null, i18nKey: 'hand.drawn' })
    seedTag({ figmaNodeId: '1:2' })

    const result = await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      tags: [desired({ figmaNodeId: '1:2' })],
    })

    expect(result.stale).toEqual([])
  })

  it('treats an empty tag list as "the frame has none", so everything is stale', async () => {
    // An empty array is a statement, not an omission: the frame still exists and
    // has no text layers in it. Only an absent field means "not about tags".
    seedPage()
    seedTag({ figmaNodeId: '1:2' })
    seedTag({ figmaNodeId: '1:3' })

    const result = await upsertPageWithTags({ projectId: PROJECT, pageId: 12, tags: [] })

    expect(result.stale).toHaveLength(2)
    expect(db.calls).not.toContain('tag.deleteMany')
  })

  it('reports nothing as stale when the caller only renamed the page', async () => {
    // A name-only update sends no tag set, so the page's tags were not the
    // subject of the request and must not be reported as missing from it.
    seedPage()
    seedTag({ figmaNodeId: '1:2' })

    const result = await upsertPageWithTags({
      projectId: PROJECT,
      pageId: 12,
      name: 'Renamed',
    })

    expect(result.stale).toEqual([])
    expect(result).toMatchObject({ created: 0, updated: 0, name: 'Renamed' })
  })

  it('keeps the current image when the caller sent none', async () => {
    seedPage()
    const result = await upsertPageWithTags({ projectId: PROJECT, pageId: 12, name: 'X' })
    expect(result.image).toBe('shot.png')
  })

  it('404s a page of another project before writing anything', async () => {
    seedPage(12, OTHER_PROJECT)
    await expect(
      upsertPageWithTags({ projectId: PROJECT, pageId: 12, tags: [desired()] })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(db.calls).not.toContain('tag.create')
  })
})

describe('listPageTags', () => {
  it('returns the page tags, hand-drawn ones included', async () => {
    seedPage()
    seedTag({ figmaNodeId: '1:2', i18nKey: 'a' })
    seedTag({ figmaNodeId: null, i18nKey: 'b' })
    const result = await listPageTags(PROJECT, 12)
    expect(result.tags).toHaveLength(2)
  })

  it('404s a page of another project', async () => {
    seedPage(12, OTHER_PROJECT)
    await expect(listPageTags(PROJECT, 12)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deletePageTags', () => {
  it('deletes the ids that belong to the page', async () => {
    seedPage()
    const a = seedTag({ figmaNodeId: '1:2' })
    const b = seedTag({ figmaNodeId: '1:3' })

    const result = await deletePageTags({
      projectId: PROJECT,
      pageId: 12,
      tagIds: [a.id, b.id],
    })

    expect(result).toEqual({ deleted: 2, ignored: 0 })
    expect(db.tags).toEqual([])
  })

  it('refuses ids that belong to another page', async () => {
    // The only place a token caller could reach past its page, so it is filtered
    // by the page rather than trusted from the body.
    seedPage(12)
    seedPage(13)
    const mine = seedTag({ pageID: 12, figmaNodeId: '1:2' })
    const theirs = seedTag({ pageID: 13, figmaNodeId: '1:3' })

    const result = await deletePageTags({
      projectId: PROJECT,
      pageId: 12,
      tagIds: [mine.id, theirs.id],
    })

    expect(result).toEqual({ deleted: 1, ignored: 1 })
    expect(db.tags.map((row) => row.id)).toEqual([theirs.id])
  })

  it('counts a repeated id once rather than as an ignored one', async () => {
    seedPage()
    const tag = seedTag({ figmaNodeId: '1:2' })

    const result = await deletePageTags({
      projectId: PROJECT,
      pageId: 12,
      tagIds: [tag.id, tag.id],
    })

    expect(result).toEqual({ deleted: 1, ignored: 0 })
  })

  it('leaves the bound i18n key alone', async () => {
    seedPage()
    seedKey(200, 'shared.key')
    const tag = seedTag({ figmaNodeId: '1:2', i18nKey: 'shared.key', i18nKeyId: 200 })

    await deletePageTags({ projectId: PROJECT, pageId: 12, tagIds: [tag.id] })

    // The key may be shared with another tag, and even an unshared draft key is
    // the editor's to clean up — same as the editor's own tag delete.
    expect(db.tags).toEqual([])
    expect(db.keys.map((row) => row.id)).toEqual([200])
    expect(db.writes.every((write) => write.model !== 'i18nKey')).toBe(true)
  })

  it('404s a page of another project', async () => {
    seedPage(12, OTHER_PROJECT)
    await expect(
      deletePageTags({ projectId: PROJECT, pageId: 12, tagIds: [1] })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(db.calls).not.toContain('tag.deleteMany')
  })
})