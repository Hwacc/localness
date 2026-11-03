import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

// `throwNamespaceHttp` uses Nitro's auto-imported `createError`; see release.test.ts.
vi.stubGlobal('createError', createError)

const db = vi.hoisted(() => ({
  namespaces: [] as Array<{ id: number; projectId: number; name: string; sort: number }>,
  keys: [] as Array<{ id: number; projectId: number; key: string }>,
  updates: [] as Array<{ id: number; sort: number }>,
}))

vi.mock('#server/libs/prisma', () => {
  const keyNamespace = {
    findMany: async ({ where }: any) =>
      db.namespaces.filter(
        (row) =>
          row.projectId === where.projectId &&
          (where.id?.not == null || row.id !== where.id.not)
      ),
    findFirst: async ({ where }: any) =>
      db.namespaces.find(
        (row) => row.id === where.id && row.projectId === where.projectId
      ) ?? null,
    update: ({ where, data }: any) => {
      db.updates.push({ id: where.id, sort: data.sort })
      return Promise.resolve()
    },
  }
  const i18nKey = {
    findMany: async ({ where }: any) =>
      db.keys.filter((row) => row.projectId === where.projectId),
  }
  return {
    default: {
      keyNamespace,
      i18nKey,
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  }
})

const { namespaceKeyIds, reorderNamespaces } = await import(
  '../../server/helper/namespace'
)

beforeEach(() => {
  db.namespaces = [
    { id: 1, projectId: 7, name: 's2w', sort: 1 },
    { id: 2, projectId: 7, name: 'hud', sort: 2 },
    { id: 3, projectId: 8, name: 'hour', sort: 1 },
  ]
  db.keys = [
    { id: 10, projectId: 7, key: 's2w_hardware_ship_term_3' },
    { id: 11, projectId: 7, key: 's2w.menu.title' },
    { id: 12, projectId: 7, key: 'hour_ago' },
    { id: 13, projectId: 7, key: 'hud_fps' },
    { id: 14, projectId: 7, key: 'S2W_upper' },
  ]
  db.updates = []
})

describe('namespaceKeyIds', () => {
  it('matches across separators, case-sensitively', async () => {
    expect(await namespaceKeyIds(7, { namespaceId: 1 })).toEqual([10, 11])
  })

  it('puts keys in no declared namespace under Ungrouped', async () => {
    // `hour` is another project's namespace, so `hour_ago` stays Ungrouped here.
    expect(await namespaceKeyIds(7, 'ungrouped')).toEqual([12, 14])
  })

  it('selects nothing for a namespace of another project', async () => {
    expect(await namespaceKeyIds(7, { namespaceId: 3 })).toEqual([])
  })

  it('does not restrict when no namespace is picked', async () => {
    expect(await namespaceKeyIds(7, null)).toBeNull()
  })
})

describe('reorderNamespaces', () => {
  it('writes sort in the given order', async () => {
    await reorderNamespaces({ projectId: 7, ids: [2, 1] })
    expect(db.updates).toEqual([
      { id: 2, sort: 1 },
      { id: 1, sort: 2 },
    ])
  })

  it.each([
    ['a partial list', [2]],
    ['a repeated id', [1, 1]],
    ['a foreign id', [1, 3]],
  ])('rejects %s', async (_label, ids) => {
    await expect(reorderNamespaces({ projectId: 7, ids })).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(db.updates).toEqual([])
  })
})
