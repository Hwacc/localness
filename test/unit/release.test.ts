import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

/*
 * `throwReleaseHttp` calls the `createError` Nitro auto-imports at runtime; unit
 * tests have no Nitro, so the h3 stub (aliased in vitest.config.ts) stands in.
 */
vi.stubGlobal('createError', createError)

type ReleaseRow = {
  id: number
  projectId: number
  name: string
  sort: number
  createdAt?: Date
  updatedAt?: Date
}
type PageLink = { pageId: number; releaseId: number }
type KeyLink = { i18nKeyId: number; releaseId: number }

const db = vi.hoisted(() => ({
  releases: [] as ReleaseRow[],
  pages: [] as Array<{ id: number; projectID: number }>,
  keys: [] as Array<{ id: number; projectId: number }>,
  pageLinks: [] as PageLink[],
  keyLinks: [] as KeyLink[],
  /** Names of delegate methods called, to assert what a path does NOT touch. */
  calls: [] as string[],
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => {
  /** Applies Prisma's `orderBy` (single key or list) so ordering is asserted. */
  function applyOrder<T extends Record<string, unknown>>(
    rows: T[],
    orderBy: unknown
  ): T[] {
    const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
    if (!orders.length) return rows
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [field, direction] = Object.entries(
          order as Record<string, string>
        )[0]!
        const left = a[field]
        const right = b[field]
        if (left === right) continue
        const delta = (left as never) < (right as never) ? -1 : 1
        return direction === 'desc' ? -delta : delta
      }
      return 0
    })
  }

  const pageRelease = {
    findMany: async ({ where }: any) => {
      db.calls.push('pageRelease.findMany')
      return db.pageLinks.filter(
        (row) =>
          (where.releaseId == null || row.releaseId === where.releaseId) &&
          (where.pageId?.in == null || where.pageId.in.includes(row.pageId))
      )
    },
    createMany: async ({ data }: any) => {
      db.calls.push('pageRelease.createMany')
      const rows = Array.isArray(data) ? data : [data]
      db.pageLinks.push(...rows)
      return { count: rows.length }
    },
    create: async ({ data }: any) => {
      db.calls.push('pageRelease.create')
      db.pageLinks.push(data)
      return data
    },
    deleteMany: async ({ where }: any) => {
      db.calls.push('pageRelease.deleteMany')
      const before = db.pageLinks.length
      db.pageLinks = db.pageLinks.filter(
        (row) =>
          !(
            (where.releaseId == null || row.releaseId === where.releaseId) &&
            (where.pageId?.in == null || where.pageId.in.includes(row.pageId))
          )
      )
      return { count: before - db.pageLinks.length }
    },
    delete: async ({ where }: any) => {
      db.calls.push('pageRelease.delete')
      const key = where.pageId_releaseId
      db.pageLinks = db.pageLinks.filter(
        (row) =>
          !(row.pageId === key.pageId && row.releaseId === key.releaseId)
      )
      return key
    },
  }
  const i18nKeyRelease = {
    findMany: async ({ where }: any) => {
      db.calls.push('i18nKeyRelease.findMany')
      return db.keyLinks.filter(
        (row) =>
          (where.releaseId == null || row.releaseId === where.releaseId) &&
          (where.i18nKeyId?.in == null ||
            where.i18nKeyId.in.includes(row.i18nKeyId))
      )
    },
    createMany: async ({ data }: any) => {
      db.calls.push('i18nKeyRelease.createMany')
      const rows = Array.isArray(data) ? data : [data]
      db.keyLinks.push(...rows)
      return { count: rows.length }
    },
    create: async ({ data }: any) => {
      db.calls.push('i18nKeyRelease.create')
      db.keyLinks.push(data)
      return data
    },
    deleteMany: async ({ where }: any) => {
      db.calls.push('i18nKeyRelease.deleteMany')
      const before = db.keyLinks.length
      db.keyLinks = db.keyLinks.filter(
        (row) =>
          !(
            (where.releaseId == null || row.releaseId === where.releaseId) &&
            (where.i18nKeyId?.in == null ||
              where.i18nKeyId.in.includes(row.i18nKeyId))
          )
      )
      return { count: before - db.keyLinks.length }
    },
    delete: async ({ where }: any) => {
      db.calls.push('i18nKeyRelease.delete')
      const key = where.i18nKeyId_releaseId
      db.keyLinks = db.keyLinks.filter(
        (row) =>
          !(
            row.i18nKeyId === key.i18nKeyId && row.releaseId === key.releaseId
          )
      )
      return key
    },
  }

  const tx = { pageRelease, i18nKeyRelease }

  return {
    default: {
      pageRelease,
      i18nKeyRelease,
      projectRelease: {
        findMany: async ({ where, orderBy }: any) => {
          db.calls.push('projectRelease.findMany')
          return applyOrder(
            db.releases.filter(
              (row) =>
                row.projectId === where.projectId &&
                (where.id?.not == null || row.id !== where.id.not)
            ),
            orderBy
          )
        },
        findFirst: async ({ where }: any) => {
          db.calls.push('projectRelease.findFirst')
          return (
            db.releases.find(
              (row) => row.id === where.id && row.projectId === where.projectId
            ) ?? null
          )
        },
        create: async ({ data }: any) => {
          db.calls.push('projectRelease.create')
          const now = new Date('2026-09-15T00:00:00.000Z')
          const row = {
            id: db.nextId++,
            ...data,
            createdAt: now,
            updatedAt: now,
          }
          db.releases.push(row)
          return row
        },
        update: async ({ where, data }: any) => {
          db.calls.push('projectRelease.update')
          const row = db.releases.find((candidate) => candidate.id === where.id)!
          Object.assign(row, data, {
            updatedAt: new Date('2026-09-15T00:00:00.000Z'),
          })
          return row
        },
        delete: async ({ where }: any) => {
          db.calls.push('projectRelease.delete')
          const row = db.releases.find((candidate) => candidate.id === where.id)!
          db.releases = db.releases.filter((candidate) => candidate.id !== where.id)
          return row
        },
        aggregate: async ({ where }: any) => {
          db.calls.push('projectRelease.aggregate')
          const sorts = db.releases
            .filter((row) => row.projectId === where.projectId)
            .map((row) => row.sort)
          return { _max: { sort: sorts.length ? Math.max(...sorts) : null } }
        },
      },
      page: {
        findMany: async ({ where }: any) => {
          db.calls.push('page.findMany')
          return db.pages.filter(
            (row) =>
              where.id.in.includes(row.id) && row.projectID === where.projectID
          )
        },
        findFirst: async ({ where }: any) => {
          db.calls.push('page.findFirst')
          return (
            db.pages.find(
              (row) => row.id === where.id && row.projectID === where.projectID
            ) ?? null
          )
        },
      },
      i18nKey: {
        findMany: async ({ where }: any) => {
          db.calls.push('i18nKey.findMany')
          return db.keys.filter(
            (row) =>
              where.id.in.includes(row.id) && row.projectId === where.projectId
          )
        },
        findFirst: async ({ where }: any) => {
          db.calls.push('i18nKey.findFirst')
          return (
            db.keys.find(
              (row) => row.id === where.id && row.projectId === where.projectId
            ) ?? null
          )
        },
      },
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  }
})

const {
  ReleaseError,
  createRelease,
  deleteRelease,
  foreignReleaseIds,
  listReleases,
  parseReleaseFilter,
  releaseNameRejectReason,
  releaseNameStatus,
  releaseWhereFragment,
  renameRelease,
  setBoundKeyReleases,
  setEntryReleases,
  setReleaseMembership,
} = await import('#server/helper/release')

function seedRelease(id: number, name: string, sort: number, projectId = 7) {
  const at = new Date('2026-09-15T00:00:00.000Z')
  db.releases.push({ id, projectId, name, sort, createdAt: at, updatedAt: at })
}

beforeEach(() => {
  db.releases = []
  db.pages = [{ id: 100, projectID: 7 }]
  db.keys = [{ id: 200, projectId: 7 }]
  db.pageLinks = []
  db.keyLinks = []
  db.calls = []
  db.nextId = 50
})

describe('releaseNameRejectReason', () => {
  it('accepts a fresh name', () => {
    expect(
      releaseNameRejectReason({ name: 'v1', takenNames: ['v2'] })
    ).toBeNull()
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(releaseNameRejectReason({ name: '', takenNames: [] })).toBe('empty')
    expect(releaseNameRejectReason({ name: '   ', takenNames: [] })).toBe('empty')
  })

  it('rejects a name already taken in the project', () => {
    expect(
      releaseNameRejectReason({ name: 'v1', takenNames: ['v1'] })
    ).toBe('duplicate')
  })

  it('treats case and padding as the same name', () => {
    // "v1" and "V1" are indistinguishable in the picker, and SQLite's unique
    // index would happily accept both.
    expect(
      releaseNameRejectReason({ name: 'V1', takenNames: ['v1'] })
    ).toBe('duplicate')
    expect(
      releaseNameRejectReason({ name: ' v1 ', takenNames: ['v1'] })
    ).toBe('duplicate')
  })

  it('maps duplicates to 409 and the rest to 400', () => {
    expect(releaseNameStatus('duplicate')).toBe(409)
    expect(releaseNameStatus('empty')).toBe(400)
  })
})

describe('foreignReleaseIds', () => {
  it('passes ids owned by the project', () => {
    expect(
      foreignReleaseIds({ releaseIds: [1, 2], projectReleaseIds: [1, 2, 3] })
    ).toEqual([])
  })

  it('reports ids from another project', () => {
    expect(
      foreignReleaseIds({ releaseIds: [1, 9], projectReleaseIds: [1] })
    ).toEqual([9])
  })
})

describe('parseReleaseFilter', () => {
  it('reads a releaseId from a string query value', () => {
    expect(parseReleaseFilter({ releaseId: '4' })).toEqual({ releaseId: 4 })
  })

  it('reads unassigned', () => {
    expect(parseReleaseFilter({ unassigned: '1' })).toBe('unassigned')
    expect(parseReleaseFilter({ unassigned: 'true' })).toBe('unassigned')
  })

  it('is All when neither is present', () => {
    expect(parseReleaseFilter({})).toBeNull()
    expect(parseReleaseFilter({ releaseId: 'abc' })).toBeNull()
    expect(parseReleaseFilter({ unassigned: '0' })).toBeNull()
  })

  it('lets an explicit id win over a stale unassigned flag', () => {
    expect(parseReleaseFilter({ releaseId: '4', unassigned: '1' })).toEqual({
      releaseId: 4,
    })
  })
})

describe('releaseWhereFragment', () => {
  it('is empty for All', () => {
    expect(releaseWhereFragment(null)).toEqual({})
  })

  it('asks for entries with no label when Unassigned', () => {
    expect(releaseWhereFragment('unassigned')).toEqual({ releases: { none: {} } })
  })

  it('asks for the labelled entries otherwise', () => {
    expect(releaseWhereFragment({ releaseId: 4 })).toEqual({
      releases: { some: { releaseId: 4 } },
    })
  })
})

describe('listReleases', () => {
  it('orders by sort then id', async () => {
    seedRelease(3, 'v2', 2)
    seedRelease(1, 'v1', 1)
    seedRelease(2, 'hotfix', 1)

    const rows = await listReleases(7)

    expect(rows.map((row) => row.name)).toEqual(['v1', 'hotfix', 'v2'])
  })

  it('ignores other projects', async () => {
    seedRelease(1, 'v1', 1)
    seedRelease(2, 'theirs', 1, 99)

    expect((await listReleases(7)).map((row) => row.name)).toEqual(['v1'])
  })
})

describe('createRelease', () => {
  it('trims the name and sorts after the existing labels', async () => {
    seedRelease(1, 'v1', 3)

    const created = await createRelease({ projectId: 7, name: '  v2  ' })

    expect(created.name).toBe('v2')
    expect(created.sort).toBe(4)
  })

  it('rejects an empty name with 400', async () => {
    await expect(
      createRelease({ projectId: 7, name: '  ' })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a duplicate name with 409', async () => {
    seedRelease(1, 'v1', 1)

    await expect(
      createRelease({ projectId: 7, name: 'v1' })
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('renameRelease', () => {
  it('allows saving a release under its own name', async () => {
    seedRelease(1, 'v1', 1)

    const renamed = await renameRelease({ projectId: 7, releaseId: 1, name: 'v1' })

    expect(renamed.name).toBe('v1')
  })

  it('rejects colliding with a sibling', async () => {
    seedRelease(1, 'v1', 1)
    seedRelease(2, 'v2', 2)

    await expect(
      renameRelease({ projectId: 7, releaseId: 2, name: 'v1' })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('404s a release from another project', async () => {
    seedRelease(1, 'theirs', 1, 99)

    await expect(
      renameRelease({ projectId: 7, releaseId: 1, name: 'v9' })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deleteRelease', () => {
  it('deletes only the label, never the content or its own links directly', async () => {
    seedRelease(1, 'v1', 1)
    db.pageLinks = [{ pageId: 100, releaseId: 1 }]
    db.keyLinks = [{ i18nKeyId: 200, releaseId: 1 }]

    await deleteRelease({ projectId: 7, releaseId: 1 })

    // The joins go with the label through the schema's onDelete: Cascade, so the
    // helper must not be deleting pages or keys itself.
    expect(db.calls).toContain('projectRelease.delete')
    expect(db.calls).not.toContain('page.findMany')
    expect(db.calls).not.toContain('i18nKey.findMany')
    expect(db.calls).not.toContain('pageRelease.deleteMany')
    expect(db.calls).not.toContain('i18nKeyRelease.deleteMany')
    // Content is untouched; only the label row is gone.
    expect(db.pages).toHaveLength(1)
    expect(db.keys).toHaveLength(1)
    expect(db.releases).toHaveLength(0)
  })
})

describe('setReleaseMembership', () => {
  it('adds only the links that are missing', async () => {
    seedRelease(1, 'v1', 1)
    db.pageLinks = [{ pageId: 100, releaseId: 1 }]

    const result = await setReleaseMembership({
      projectId: 7,
      releaseId: 1,
      kind: 'page',
      ids: [100],
      mode: 'add',
    })

    expect(result).toEqual({ ok: true, changed: 0 })
    expect(db.pageLinks).toHaveLength(1)
  })

  it('adds a key link in bulk', async () => {
    seedRelease(1, 'v1', 1)

    const result = await setReleaseMembership({
      projectId: 7,
      releaseId: 1,
      kind: 'key',
      ids: [200],
      mode: 'add',
    })

    expect(result).toEqual({ ok: true, changed: 1 })
    expect(db.keyLinks).toEqual([{ i18nKeyId: 200, releaseId: 1 }])
  })

  it('removes links without touching the entries', async () => {
    seedRelease(1, 'v1', 1)
    db.keyLinks = [{ i18nKeyId: 200, releaseId: 1 }]

    await setReleaseMembership({
      projectId: 7,
      releaseId: 1,
      kind: 'key',
      ids: [200],
      mode: 'remove',
    })

    expect(db.keyLinks).toEqual([])
    expect(db.keys).toHaveLength(1)
  })

  it('refuses ids that are not in the project', async () => {
    seedRelease(1, 'v1', 1)

    await expect(
      setReleaseMembership({
        projectId: 7,
        releaseId: 1,
        kind: 'key',
        ids: [999],
        mode: 'add',
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s a release from another project', async () => {
    seedRelease(1, 'theirs', 1, 99)

    await expect(
      setReleaseMembership({
        projectId: 7,
        releaseId: 1,
        kind: 'key',
        ids: [200],
        mode: 'add',
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('setEntryReleases', () => {
  it('replaces the whole set: removes the dropped, adds the new', async () => {
    seedRelease(1, 'v1', 1)
    seedRelease(2, 'v2', 2)
    db.keyLinks = [
      { i18nKeyId: 200, releaseId: 1 },
      { i18nKeyId: 200, releaseId: 2 },
    ]

    const result = await setEntryReleases({
      projectId: 7,
      kind: 'key',
      id: 200,
      releaseIds: [2],
    })

    expect(result).toEqual({ ok: true, releaseIds: [2] })
    expect(db.keyLinks).toEqual([{ i18nKeyId: 200, releaseId: 2 }])
  })

  it('clears every label when given an empty set', async () => {
    seedRelease(1, 'v1', 1)
    db.keyLinks = [{ i18nKeyId: 200, releaseId: 1 }]

    await setEntryReleases({ projectId: 7, kind: 'key', id: 200, releaseIds: [] })

    expect(db.keyLinks).toEqual([])
  })

  it('rejects a release from another project', async () => {
    seedRelease(1, 'theirs', 1, 99)

    await expect(
      setEntryReleases({ projectId: 7, kind: 'key', id: 200, releaseIds: [1] })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('404s an entry that is not in this project', async () => {
    await expect(
      setEntryReleases({ projectId: 7, kind: 'page', id: 555, releaseIds: [] })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deduplicates the requested ids', async () => {
    seedRelease(1, 'v1', 1)

    const result = await setEntryReleases({
      projectId: 7,
      kind: 'page',
      id: 100,
      releaseIds: [1, 1],
    })

    expect(result.releaseIds).toEqual([1])
    expect(db.pageLinks).toEqual([{ pageId: 100, releaseId: 1 }])
  })
})

describe('setBoundKeyReleases', () => {
  it('labels the key the tag is bound to', async () => {
    seedRelease(1, 'v1', 1)

    await setBoundKeyReleases({ projectId: 7, i18nKeyId: 200, releaseIds: [1] })

    expect(db.keyLinks).toEqual([{ i18nKeyId: 200, releaseId: 1 }])
  })

  it('leaves the labels alone when the caller sent none', async () => {
    seedRelease(1, 'v1', 1)
    await setEntryReleases({
      projectId: 7,
      kind: 'key',
      id: 200,
      releaseIds: [1],
    })
    db.calls = []

    await setBoundKeyReleases({ projectId: 7, i18nKeyId: 200 })

    expect(db.keyLinks).toEqual([{ i18nKeyId: 200, releaseId: 1 }])
    expect(db.calls).toEqual([])
  })

  it('clears them when the caller sends an empty set', async () => {
    seedRelease(1, 'v1', 1)
    await setEntryReleases({
      projectId: 7,
      kind: 'key',
      id: 200,
      releaseIds: [1],
    })

    await setBoundKeyReleases({ projectId: 7, i18nKeyId: 200, releaseIds: [] })

    expect(db.keyLinks).toEqual([])
  })

  it('has nothing to do while no key is bound', async () => {
    seedRelease(1, 'v1', 1)

    await setBoundKeyReleases({ projectId: 7, i18nKeyId: null, releaseIds: [1] })

    expect(db.keyLinks).toEqual([])
    expect(db.calls).toEqual([])
  })

  it('reports a label from another project as 400 instead of writing it', async () => {
    await expect(
      setBoundKeyReleases({ projectId: 7, i18nKeyId: 200, releaseIds: [99] })
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(db.keyLinks).toEqual([])
  })
})

describe('ReleaseError', () => {
  it('carries the status it was built with', () => {
    const error = new ReleaseError(409, 'nope')
    expect(error.statusCode).toBe(409)
    expect(error.name).toBe('ReleaseError')
  })
})