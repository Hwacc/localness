import { beforeEach, describe, expect, it, vi } from 'vitest'

type KeyRow = {
  id: number
  projectId: number
  key: string
  type: string
  origin: string
  fingerprint: string
  description: string | null
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
  }>
}

const db = vi.hoisted(() => ({
  keys: [] as KeyRow[],
  /** Delegate methods in call order, to assert what a path does NOT touch. */
  calls: [] as string[],
  logNulledFor: [] as number[],
  baseDeleted: [] as Array<{ projectId: number; key: string }>,
  tagUpdated: [] as Array<{ where: unknown; data: unknown }>,
  nextId: 900,
  /** Key text whose target insert throws, for the partial-failure case. */
  failOnKey: null as string | null,
  reset() {
    this.keys = []
    this.calls = []
    this.logNulledFor = []
    this.baseDeleted = []
    this.tagUpdated = []
    this.nextId = 900
    this.failOnKey = null
  },
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    i18nKey: {
      create: async ({ data }: any) => {
        db.calls.push('i18nKey.create')
        if (db.failOnKey && data.key === db.failOnKey) {
          throw new Error('insert exploded')
        }
        const row = { ...data, id: db.nextId++, locales: [] }
        db.keys.push(row)
        return { id: row.id }
      },
      delete: async ({ where }: any) => {
        db.calls.push('i18nKey.delete')
        const row = db.keys.find((candidate) => candidate.id === where.id)
        db.keys = db.keys.filter((candidate) => candidate.id !== where.id)
        return row
      },
    },
    localeValue: {
      createMany: async ({ data }: any) => {
        db.calls.push('localeValue.createMany')
        return { count: Array.isArray(data) ? data.length : 1 }
      },
      // The target's own source language is filled from the key's original text.
      upsert: async () => {
        db.calls.push('localeValue.upsert')
        return {}
      },
    },
    translationLog: {
      updateMany: async ({ where }: any) => {
        db.calls.push('translationLog.updateMany')
        db.logNulledFor.push(where.i18nKeyId)
        return { count: 1 }
      },
    },
    gitSyncBase: {
      deleteMany: async ({ where }: any) => {
        db.calls.push('gitSyncBase.deleteMany')
        db.baseDeleted.push({ projectId: where.projectId, key: where.key })
        return { count: 1 }
      },
    },
    gitSyncConflict: {
      deleteMany: async () => {
        db.calls.push('gitSyncConflict.deleteMany')
        return { count: 0 }
      },
    },
    tag: {
      updateMany: async ({ where, data }: any) => {
        db.calls.push('tag.updateMany')
        db.tagUpdated.push({ where, data })
        return { count: 1 }
      },
      deleteMany: async () => {
        db.calls.push('tag.deleteMany')
        return { count: 0 }
      },
    },
  }

  const client = {
    // Where each project keeps a key's original text; read before the loop.
    projectSettings: {
      findUnique: async () => ({ localeFallback: 'en' }),
    },
    i18nKey: {
      findMany: async ({ where }: any) => {
        db.calls.push('i18nKey.findMany')
        if (where.id) {
          return db.keys.filter(
            (row) =>
              where.id.in.includes(row.id) && row.projectId === where.projectId
          )
        }
        return db.keys.filter(
          (row) =>
            row.projectId === where.projectId && where.key.in.includes(row.key)
        )
      },
    },
    $transaction: async (fn: (c: typeof tx) => Promise<unknown>) => fn(tx),
  }

  return { default: client }
})

const {
  TRANSFER_REJECTION_MESSAGES,
  distinctIds,
  foreignKeyIds,
  localeWritesFor,
  planTransfer,
  transferKeys,
  transferRejectReason,
} = await import('#server/helper/i18n-transfer')

const SOURCE = 1
const TARGET = 2

function key(partial: Partial<KeyRow> & { id: number; key: string }): KeyRow {
  return {
    projectId: SOURCE,
    type: 'STRING',
    origin: '',
    fingerprint: '',
    description: null,
    locales: [],
    ...partial,
  }
}

/** Drops the pre-flight reads so only the write sequence is left. */
function mutations() {
  return db.calls.filter((name) => name !== 'i18nKey.findMany')
}

beforeEach(() => {
  db.reset()
})

describe('transferRejectReason', () => {
  it('refuses an empty selection', () => {
    expect(
      transferRejectReason({
        sourceProjectId: SOURCE,
        targetProjectId: TARGET,
        requestedIds: [],
      })
    ).toBe('empty-selection')
  })

  it('refuses the project itself', () => {
    expect(
      transferRejectReason({
        sourceProjectId: SOURCE,
        targetProjectId: SOURCE,
        requestedIds: [7],
      })
    ).toBe('same-project')
  })

  it('admits a real batch', () => {
    expect(
      transferRejectReason({
        sourceProjectId: SOURCE,
        targetProjectId: TARGET,
        requestedIds: [7],
      })
    ).toBeNull()
  })

  it('has a message for every rejection', () => {
    expect(Object.keys(TRANSFER_REJECTION_MESSAGES).sort()).toEqual([
      'empty-selection',
      'foreign-keys',
      'same-project',
    ])
  })
})

describe('foreignKeyIds', () => {
  it('names the requested ids the project does not own', () => {
    expect(foreignKeyIds([1, 2, 3], [1, 3])).toEqual([2])
    expect(foreignKeyIds([1], [1])).toEqual([])
  })
})

describe('distinctIds', () => {
  it('collapses repeats and keeps the first-seen order', () => {
    expect(distinctIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2])
  })
})

describe('planTransfer', () => {
  const source = [key({ id: 1, key: 'a.b' }), key({ id: 2, key: 'c.d' })]

  it('writes everything when the target is empty', () => {
    const plan = planTransfer({ source, targetKeys: [] })
    expect(plan.written.map((row) => row.key)).toEqual(['a.b', 'c.d'])
    expect(plan.skipped).toEqual([])
  })

  it('skips only the colliding key and keeps the rest', () => {
    // Partial success is the contract, not a courtesy.
    const plan = planTransfer({ source, targetKeys: ['c.d'] })
    expect(plan.written.map((row) => row.key)).toEqual(['a.b'])
    expect(plan.skipped).toEqual([{ key: 'c.d', reason: 'key-exists' }])
  })

  it('judges the conflict by key string, not by fingerprint', () => {
    const colliding = key({ id: 1, key: 'a.b', fingerprint: 'totally-different' })
    const plan = planTransfer({ source: [colliding], targetKeys: ['a.b'] })
    expect(plan.written).toEqual([])
    expect(plan.skipped).toEqual([{ key: 'a.b', reason: 'key-exists' }])
  })

  it('treats an auto-draft key like any other', () => {
    const draft = key({ id: 1, key: '__draft_1a2b3' })
    expect(planTransfer({ source: [draft], targetKeys: [] }).written).toEqual([
      draft,
    ])
    expect(
      planTransfer({ source: [draft], targetKeys: ['__draft_1a2b3'] }).skipped
    ).toEqual([{ key: '__draft_1a2b3', reason: 'key-exists' }])
  })
})

describe('localeWritesFor', () => {
  it('carries every source locale with both texts verbatim', () => {
    const source = key({
      id: 1,
      key: 'a.b',
      locales: [
        { locale: 'en', draftText: 'Save', publishedText: 'Save' },
        // A locale the target does not configure still travels.
        { locale: 'ja', draftText: '保存', publishedText: null },
        // A row with neither text is still a row.
        { locale: 'de', draftText: null, publishedText: null },
      ],
    })
    expect(localeWritesFor(source, 42)).toEqual([
      { i18nKeyId: 42, locale: 'en', draftText: 'Save', publishedText: 'Save' },
      { i18nKeyId: 42, locale: 'ja', draftText: '保存', publishedText: null },
      { i18nKeyId: 42, locale: 'de', draftText: null, publishedText: null },
    ])
  })
})

describe('transferKeys — copy', () => {
  it('writes the target and never touches the source', async () => {
    db.keys.push(
      key({
        id: 1,
        key: 'a.b',
        type: 'PLURAL',
        origin: 'Save',
        fingerprint: 'fp1',
        description: 'a label',
        locales: [{ locale: 'en', draftText: 'Save', publishedText: 'Save' }],
      })
    )

    const result = await transferKeys({
      mode: 'copy',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1],
    })

    expect(result).toMatchObject({
      mode: 'copy',
      copied: 1,
      removed: 0,
      movedIds: [],
      skipped: [],
      failed: [],
    })
    expect(mutations()).toEqual([
      'i18nKey.create',
      'localeValue.createMany',
      'localeValue.upsert',
    ])
    expect(db.logNulledFor).toEqual([])
    expect(db.baseDeleted).toEqual([])
    expect(db.tagUpdated).toEqual([])
    // The source row survives a copy.
    expect(db.keys.find((row) => row.id === 1)).toBeTruthy()
  })

  it('allows a published key through', async () => {
    // `assertI18nKeyWritable` would 409 here; a transfer must not consult it.
    db.keys.push(
      key({
        id: 1,
        key: 'a.b',
        locales: [{ locale: 'en', draftText: 'Save', publishedText: 'Save' }],
      })
    )

    const result = await transferKeys({
      mode: 'copy',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1],
    })

    expect(result.copied).toBe(1)
    expect(result.failed).toEqual([])
  })
})

describe('transferKeys — move', () => {
  function seed() {
    db.keys.push(
      key({
        id: 1,
        key: 'a.b',
        origin: 'Save',
        fingerprint: 'fp1',
        locales: [{ locale: 'en', draftText: 'Save', publishedText: 'Save' }],
      }),
      key({
        id: 2,
        key: 'c.d',
        locales: [{ locale: 'en', draftText: 'Cancel', publishedText: null }],
      })
    )
  }

  it('runs the write sequence in order', async () => {
    seed()

    await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1],
    })

    // The order is load-bearing, not incidental.
    expect(mutations()).toEqual([
      'i18nKey.create',
      'localeValue.createMany',
      'localeValue.upsert',
      'translationLog.updateMany',
      'gitSyncConflict.deleteMany',
      'tag.updateMany',
      'i18nKey.delete',
    ])
  })

  it('nulls the log rows and clears the tag string before the delete', async () => {
    seed()

    await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1],
    })

    // NoAction would abort the delete otherwise, and `where: { i18nKeyId }`
    // would match nothing after it.
    expect(db.logNulledFor).toEqual([1])
    expect(mutations().indexOf('translationLog.updateMany')).toBeLessThan(
      mutations().indexOf('i18nKey.delete')
    )
    expect(db.tagUpdated).toEqual([
      { where: { i18nKeyId: 1 }, data: { i18nKey: null } },
    ])
  })

  it('leaves the source git bases alone', async () => {
    seed()

    await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1],
    })

    // A base records what the platform and Git last agreed on. Keeping it is
    // what makes the source's next pull read the dropped key as `keep-ours`
    // (filtered out) instead of `apply-theirs` (which would re-create it).
    expect(db.calls).not.toContain('gitSyncBase.deleteMany')
    expect(db.baseDeleted).toEqual([])
  })

  it('keeps every drawn box', async () => {
    seed()

    await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1, 2],
    })

    expect(db.calls).not.toContain('tag.deleteMany')
  })

  it('reports the removed source ids', async () => {
    seed()

    const result = await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1, 2],
    })

    expect(result).toMatchObject({ copied: 2, removed: 2 })
    expect([...result.movedIds].sort()).toEqual([1, 2])
    expect(db.keys.filter((row) => row.projectId === SOURCE)).toEqual([])
    expect(db.keys.filter((row) => row.projectId === TARGET)).toHaveLength(2)
  })

  it('skips a colliding key without deleting it from the source', async () => {
    seed()
    db.keys.push(key({ id: 50, projectId: TARGET, key: 'a.b' }))

    const result = await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1, 2],
    })

    expect(result.skipped).toEqual([{ key: 'a.b', reason: 'key-exists' }])
    expect(result.copied).toBe(1)
    expect(result.removed).toBe(1)
    // The skipped key must still be in the source.
    expect(db.keys.find((row) => row.id === 1)).toBeTruthy()
    expect(db.keys.find((row) => row.id === 2)).toBeUndefined()
  })

  it('carries on past a key whose write throws', async () => {
    seed()
    db.failOnKey = 'a.b'

    const result = await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1, 2],
    })

    expect(result.failed).toEqual([{ key: 'a.b' }])
    expect(result.copied).toBe(1)
    expect(result.removed).toBe(1)
    // The failed key is still in the source, untouched.
    expect(db.keys.find((row) => row.id === 1)).toBeTruthy()
  })

  it('collapses duplicate ids so a key is never transferred twice', async () => {
    seed()

    const result = await transferKeys({
      mode: 'move',
      sourceProjectId: SOURCE,
      targetProjectId: TARGET,
      keyIds: [1, 1],
    })

    expect(result.copied).toBe(1)
    expect(result.skipped).toEqual([])
  })
})

describe('transferKeys — refusals', () => {
  it('refuses the project itself before loading anything', async () => {
    await expect(
      transferKeys({
        mode: 'copy',
        sourceProjectId: SOURCE,
        targetProjectId: SOURCE,
        keyIds: [1],
      })
    ).rejects.toThrow(TRANSFER_REJECTION_MESSAGES['same-project'])
    expect(db.calls).toEqual([])
  })

  it('refuses an id the source project does not own', async () => {
    db.keys.push(key({ id: 1, key: 'a.b' }))
    await expect(
      transferKeys({
        mode: 'copy',
        sourceProjectId: SOURCE,
        targetProjectId: TARGET,
        keyIds: [1, 999],
      })
    ).rejects.toThrow(/999/)
    expect(mutations()).toEqual([])
  })
})
