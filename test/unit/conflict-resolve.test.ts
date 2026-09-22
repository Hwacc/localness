import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `sync.ts` reaches for the Prisma singleton at module scope, so the client is
 * replaced wholesale. Only the delegates `resolveConflict` touches are modelled.
 */
const db = vi.hoisted(() => ({
  conflict: null as Record<string, unknown> | null,
  /** The platform's own row for the conflicted name, or null if it is gone. */
  key: null as { id: number } | null,
  /** A row already sitting on the name `renamed` wants to move to. */
  clash: false,
  calls: [] as string[],
  tagUpdates: [] as Array<{ where: unknown; data: unknown }>,
  bases: [] as Array<{ projectId: number; key: string; locale: string }>,
  conflictUpdate: null as Record<string, unknown> | null,
  reset() {
    this.conflict = {
      id: 7,
      projectId: 1,
      key: 'a.b',
      locale: 'en',
      baseText: 'base',
      oursText: 'ours',
      theirsText: 'theirs',
      publishedText: null,
      status: 'open',
    }
    this.key = { id: 42 }
    this.clash = false
    this.calls = []
    this.tagUpdates = []
    this.bases = []
    this.conflictUpdate = null
  },
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    i18nKey: {
      update: async () => {
        db.calls.push('i18nKey.update')
        return {}
      },
    },
    tag: {
      updateMany: async ({ where, data }: any) => {
        db.calls.push('tag.updateMany')
        db.tagUpdates.push({ where, data })
        return { count: 1 }
      },
    },
  }

  const client = {
    /** Read before the resolution lands: which locale holds a key's original text. */
    projectSettings: {
      findUnique: async () => ({ localeFallback: 'en' }),
    },
    gitSyncConflict: {
      findFirst: async () => {
        db.calls.push('gitSyncConflict.findFirst')
        return db.conflict
      },
      update: async ({ data }: any) => {
        db.calls.push('gitSyncConflict.update')
        db.conflictUpdate = data
        return data
      },
    },
    i18nKey: {
      // The clash probe is the one that carries an `id: { not }`.
      findFirst: async ({ where }: any) => {
        db.calls.push('i18nKey.findFirst')
        if (where.id?.not != null) return db.clash ? { id: 99 } : null
        return db.key
      },
      upsert: async () => {
        db.calls.push('i18nKey.upsert')
        return { id: 42 }
      },
    },
    localeValue: {
      upsert: async () => {
        db.calls.push('localeValue.upsert')
        return {}
      },
    },
    gitSyncBase: {
      upsert: async ({ where }: any) => {
        db.calls.push('gitSyncBase.upsert')
        db.bases.push(where.projectId_key_locale)
        return {}
      },
    },
    gitSyncLog: {
      create: async () => {
        db.calls.push('gitSyncLog.create')
        return {}
      },
    },
    $transaction: async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx),
  }

  return { default: client }
})

const { resolveConflict } = await import('#server/libs/git-sync/sync')

beforeEach(() => {
  db.reset()
})

async function resolve(extra: Record<string, unknown> = {}) {
  return resolveConflict({
    projectId: 1,
    conflictId: 7,
    action: 'renamed',
    newKey: 'a.b.legacy',
    ...extra,
  } as Parameters<typeof resolveConflict>[0])
}

describe('resolveConflict — renamed', () => {
  it('moves the platform key aside and writes no draft under the old name', async () => {
    await resolve()

    expect(db.calls).toContain('i18nKey.update')
    expect(db.calls).toContain('tag.updateMany')
    // The whole point: upserting `conflict.key` would re-create the key the
    // rename just moved away from, and the call would still report success.
    expect(db.calls).not.toContain('i18nKey.upsert')
    expect(db.calls).not.toContain('localeValue.upsert')
  })

  it('keeps the base on the vacated name so the key does not come back', async () => {
    await resolve()

    // `keep-ours` territory: the platform dropped the name, Git did not move.
    expect(db.bases).toEqual([{ projectId: 1, key: 'a.b', locale: 'en' }])
  })

  it('follows the denormalised key on the tags', async () => {
    await resolve()

    // Without this the drawn boxes keep the old name, and saving one would
    // re-create it through `resolveTagI18n`.
    expect(db.tagUpdates).toEqual([
      { where: { i18nKeyId: 42 }, data: { i18nKey: 'a.b.legacy' } },
    ])
  })

  it('records the new name on the conflict', async () => {
    await resolve()

    expect(db.conflictUpdate).toMatchObject({
      status: 'renamed',
      mergedText: 'a.b.legacy',
    })
  })

  it('refuses a name already used in the project', async () => {
    db.clash = true
    await expect(resolve()).rejects.toThrow(/already used/)
    expect(db.calls).not.toContain('i18nKey.update')
    expect(db.calls).not.toContain('gitSyncBase.upsert')
  })

  it('refuses an empty name', async () => {
    await expect(resolve({ newKey: '   ' })).rejects.toThrow(/requires newKey/)
  })

  it('still closes when the platform key is already gone', async () => {
    db.key = null
    await resolve()

    // Nothing to move, but the base write is what keeps the remote name from
    // being pulled straight back in.
    expect(db.calls).not.toContain('i18nKey.update')
    expect(db.bases).toEqual([{ projectId: 1, key: 'a.b', locale: 'en' }])
  })
})

describe('resolveConflict — the pre-existing actions', () => {
  it('still writes the chosen text under the conflicted name', async () => {
    await resolve({ action: 'ours', newKey: undefined })

    expect(db.calls).toContain('i18nKey.upsert')
    expect(db.calls).toContain('localeValue.upsert')
    expect(db.bases).toEqual([{ projectId: 1, key: 'a.b', locale: 'en' }])
  })

  it('refuses a conflict that is already resolved', async () => {
    db.conflict!.status = 'ours'
    await expect(resolve()).rejects.toThrow(/already resolved/)
  })
})
