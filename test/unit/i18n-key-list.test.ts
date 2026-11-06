import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  keys: [] as Array<{ id: number; projectId: number; key: string }>,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    keyNamespace: {
      findMany: async () => [{ id: 1, projectId: 7, name: 'hud', sort: 1 }],
    },
    i18nKey: {
      findMany: async ({ where }: any) =>
        db.keys.filter((row) => row.projectId === where.projectId),
    },
  },
}))

const { i18nKeyListWhere, parseI18nKeyListFilters } = await import(
  '../../server/helper/i18n-key-list'
)

beforeEach(() => {
  db.keys = [
    { id: 10, projectId: 7, key: 'hud_fps' },
    { id: 11, projectId: 7, key: 'hour_ago' },
    { id: 12, projectId: 7, key: '__draft_ab12' },
  ]
})

function where(query: Record<string, string>) {
  return i18nKeyListWhere(7, parseI18nKeyListFilters(query))
}

const unnamed = {
  OR: [
    { key: { startsWith: '__unnamed_' } },
    { key: { startsWith: '__draft_' } },
  ],
}

describe('i18nKeyListWhere placeholder keys', () => {
  it('lists only placeholder keys under Unnamed, even without includeDraftKeys', async () => {
    const result = await where({ unnamed: '1' })
    expect(result?.AND).toEqual([unnamed])
  })

  it('leaves placeholder keys out of Ungrouped', async () => {
    const result = await where({ ungrouped: '1', includeDraftKeys: '1' })
    expect(result?.AND).toContainEqual({ NOT: unnamed })
  })

  it('keeps them in All when asked to', async () => {
    const result = await where({ includeDraftKeys: '1' })
    expect(result?.AND).toEqual([])
  })
})
