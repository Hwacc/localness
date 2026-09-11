import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * `sync.ts` imports the Prisma singleton at module scope, so the client is
 * replaced wholesale. This keeps the suite in-memory and fast while still
 * exercising the real preview/apply logic.
 */
const db = vi.hoisted(() => ({
  conflicts: 0,
  binding: null as Record<string, unknown> | null,
  project: null as Record<string, unknown> | null,
  keys: [] as Record<string, unknown>[],
  bases: [] as Record<string, unknown>[],
  previews: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  basesWritten: [] as Record<string, unknown>[],
  bindingUpdates: [] as Record<string, unknown>[],
  previewUpdates: [] as Record<string, unknown>[],
}))

/** Records what the fake remote was asked to do. */
const remote = vi.hoisted(() => ({
  /** Sha returned by `findCommitByTrailer`; null means "no prior batch". */
  orphanSha: null as string | null,
  written: [] as Record<string, string>[],
  commits: [] as string[],
  cloneDepth: undefined as number | undefined,
  source: new Map<string, string>(),
  conflictsWritten: [] as Record<string, unknown>[],
}))

vi.mock('#server/libs/git-sync/git-remote', () => ({
  remoteHeadSha: async () => 'sha-head',
  withClonedRepo: async (params: {
    depth?: number
    run: (dir: string, sha: string) => Promise<unknown>
  }) => {
    remote.cloneDepth = params.depth
    return params.run('/tmp/fake-repo', 'sha-clone')
  },
  findCommitByTrailer: async () => remote.orphanSha,
  commitAndPush: async (params: { message: string }) => {
    remote.commits.push(params.message)
    return { pushed: true, commitSha: 'sha-new-commit' }
  },
}))

vi.mock('#server/libs/git-sync/lilt-swbu', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#server/libs/git-sync/lilt-swbu')>()
  return {
    ...actual,
    writeSourceBatch: async (params: { entries: Record<string, string> }) => {
      remote.written.push(params.entries)
      return 'en_2026-09-10.json'
    },
    readMergedSourceLocale: async () => remote.source,
  }
})

vi.mock('#server/libs/prisma', () => {
  const tx = {
    gitSyncBinding: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.bindingUpdates.push(data)
        return {}
      },
    },
    gitSyncBase: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        db.basesWritten.push(create)
        return {}
      },
    },
    gitSyncPreview: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.previewUpdates.push(data)
        return {}
      },
    },
    gitSyncConflict: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        remote.conflictsWritten.push(create)
        return {}
      },
    },
  }
  return {
    default: {
      gitSyncConflict: {
        count: async () => db.conflicts,
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          remote.conflictsWritten.push(create)
          return {}
        },
      },
      gitSyncBinding: { findUnique: async () => db.binding },
      project: { findUnique: async () => db.project },
      i18nKey: { findMany: async () => db.keys },
      gitSyncBase: { findMany: async () => db.bases },
      $transaction: async (fn: (c: unknown) => Promise<void>) => fn(tx),
      gitSyncPreview: {
        updateMany: async () => ({ count: 0 }),
        findFirst: async ({ where }: { where: { id: number } }) =>
          db.previews.find((p) => p.id === where.id) ?? null,
        update: async () => ({}),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: db.created.length + 1, ...data }
          db.created.push(row)
          return row
        },
      },
    },
  }
})

const { previewPush, applyPush } = await import(
  '#server/libs/git-sync/sync'
)

function key(name: string, published: string | null) {
  return {
    key: name,
    locales: [{ locale: 'en', publishedText: published, draftText: null }],
  }
}

beforeEach(() => {
  db.conflicts = 0
  db.binding = {
    id: 1,
    token: 'tok',
    enabled: true,
    product: 'cortex',
    remoteUrl: 'https://example.test/w/r.git',
    branch: 'main',
    credentialKind: 'repo_access_token',
    localeMap: null,
    seenFiles: [],
  }
  db.project = { id: 2, settings: { localeFallback: 'en' } }
  db.keys = []
  db.bases = []
  db.previews = []
  db.created = []
  db.basesWritten = []
  db.bindingUpdates = []
  db.previewUpdates = []
  remote.orphanSha = null
  remote.written = []
  remote.commits = []
  remote.cloneDepth = undefined
  remote.source = new Map()
  remote.conflictsWritten = []
})

describe('previewPush', () => {
  it('writes nothing but a preview row', async () => {
    db.keys = [key('a', 'text')]
    await previewPush(2, 'tester')
    expect(db.created).toHaveLength(1)
    expect(db.created[0]!.status).toBe('pending')
  })

  it('explains an empty delta instead of failing', async () => {
    db.keys = [key('a', 'text'), key('b', 'other')]
    db.bases = [
      { key: 'a', baseText: 'text' },
      { key: 'b', baseText: 'other' },
    ]
    remote.source = new Map([
      ['a', 'text'],
      ['b', 'other'],
    ])
    const preview = await previewPush(2, 'tester')
    expect(preview.candidates).toHaveLength(2)
    expect(preview.candidates.every((c) => !c.eligible)).toBe(true)
    expect(preview.counts.unchanged).toBe(2)
  })

  it('proposes new and changed keys only', async () => {
    db.keys = [
      key('fresh', 'text'),
      key('moved', 'new'),
      key('same', 'text'),
      key('unpublished', null),
      key('__draft_abc12', 'text'),
    ]
    db.bases = [
      { key: 'moved', baseText: 'old' },
      { key: 'same', baseText: 'text' },
    ]
    remote.source = new Map([
      ['moved', 'old'],
      ['same', 'text'],
    ])
    const preview = await previewPush(2, 'tester')
    const eligible = preview.candidates
      .filter((c) => c.eligible)
      .map((c) => c.key)
    expect(eligible).toEqual(['fresh', 'moved'])
    expect(preview.candidates).toHaveLength(5)
  })

  it('does not propose a key when only remote source moved', async () => {
    db.keys = [key('a', 'ours')]
    db.bases = [{ key: 'a', baseText: 'ours' }]
    remote.source = new Map([['a', 'theirs']])
    const preview = await previewPush(2, 'tester')
    expect(preview.candidates[0]!.reason).toBe('remote-changed')
    expect(preview.candidates[0]!.eligible).toBe(false)
    expect(preview.candidates[0]!.theirsText).toBe('theirs')
  })

  it('marks a conflict when platform and remote source both moved', async () => {
    db.keys = [key('a', 'ours')]
    db.bases = [{ key: 'a', baseText: 'base' }]
    remote.source = new Map([['a', 'theirs']])
    const preview = await previewPush(2, 'tester')
    expect(preview.candidates[0]!.reason).toBe('conflict')
    expect(preview.candidates[0]!.eligible).toBe(false)
    expect(remote.conflictsWritten).toHaveLength(1)
    expect(remote.conflictsWritten[0]!.key).toBe('a')
  })

  it('refuses to preview while conflicts are open', async () => {
    db.conflicts = 3
    await expect(previewPush(2, 'tester')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('refuses when git sync is not configured', async () => {
    db.binding = null
    await expect(previewPush(2, 'tester')).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe('applyPush', () => {
  const pending = {
    id: 1,
    kind: 'push',
    status: 'pending',
    commitSha: '',
    expiresAt: new Date(Date.now() + 60_000),
    candidates: {
      sourceLocale: 'en',
      candidates: [{ key: 'a', baseText: '', text: 'text' }],
    },
  }

  it('rejects an expired preview', async () => {
    db.previews = [{ ...pending, expiresAt: new Date(Date.now() - 1000) }]
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects a preview that was already applied', async () => {
    db.previews = [{ ...pending, status: 'applied' }]
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects an unknown preview', async () => {
    await expect(
      applyPush({
        projectId: 2,
        previewId: 99,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses when conflicts opened after the preview', async () => {
    db.previews = [pending]
    db.conflicts = 1
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('skips a selected key that lost its published text', async () => {
    // Re-read from the database, not from the snapshot: the key was
    // unpublished between preview and apply, so it must not be committed.
    db.previews = [pending]
    db.keys = [key('a', null)]
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('records the sha of the commit it created, not the pre-push head', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    const result = await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(result.pushed).toBe(true)
    expect(result.reconciled).toBe(false)
    // 'sha-clone' is the head we cloned; the base must point at the new commit.
    expect(db.basesWritten).toHaveLength(1)
    expect(db.basesWritten[0]!.commitSha).toBe('sha-new-commit')
    expect(db.previewUpdates[0]!.commitSha).toBe('sha-new-commit')
  })

  it('stamps the preview id into the commit body', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(remote.commits[0]).toContain('Localness-Preview: 1')
  })

  it('reconciles instead of pushing a batch that already landed', async () => {
    // The previous attempt pushed successfully but died before its bookkeeping
    // transaction committed. Re-running must not write the batch a second time.
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    remote.orphanSha = 'sha-orphan'
    const result = await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(result.reconciled).toBe(true)
    expect(result.pushed).toBe(true)
    expect(remote.written).toHaveLength(0)
    expect(remote.commits).toHaveLength(0)
    // Bookkeeping still runs, against the commit that actually landed.
    expect(db.basesWritten[0]!.commitSha).toBe('sha-orphan')
    expect(db.bindingUpdates[0]!.seenFiles).toBeUndefined()
  })

  it('writes only the overlay keys as an incremental batch', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'platform')]
    db.bases = [{ key: 'a', baseText: 'base' }]
    remote.source = new Map([
      ['a', 'base'],
      ['only-on-git', 'keep-me'],
    ])
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(remote.written[0]).toEqual({ a: 'platform' })
    expect(db.basesWritten.map((row) => row.key)).toEqual(['a'])
  })

  it('overwrites Git when a remote-ahead key is explicitly selected', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'ours')]
    db.bases = [{ key: 'a', baseText: 'ours' }]
    remote.source = new Map([['a', 'theirs']])
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(remote.written[0]).toEqual({ a: 'ours' })
    expect(db.basesWritten.map((row) => row.key)).toEqual(['a'])
  })

  it('pushes safe keys and records a conflict for diverged source', async () => {
    db.previews = [
      {
        ...pending,
        candidates: {
          sourceLocale: 'en',
          candidates: [
            { key: 'a', baseText: '', text: 'text' },
            { key: 'b', baseText: 'base', text: 'ours' },
          ],
        },
      },
    ]
    db.keys = [key('a', 'text'), key('b', 'ours')]
    db.bases = [{ key: 'b', baseText: 'base' }]
    remote.source = new Map([['b', 'theirs']])
    const result = await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a', 'b'],
      triggeredBy: 't',
    })
    expect(result.pushed).toBe(true)
    expect(result.conflicts).toBe(1)
    expect(remote.written[0]).toEqual({ a: 'text' })
    expect(remote.conflictsWritten).toHaveLength(1)
    expect(remote.conflictsWritten[0]!.key).toBe('b')
    expect(db.basesWritten.map((row) => row.key)).toEqual(['a'])
  })

  it('records conflicts even when no overlay keys are selected', async () => {
    db.previews = [pending]
    db.keys = [key('b', 'ours')]
    db.bases = [{ key: 'b', baseText: 'base' }]
    remote.source = new Map([['b', 'theirs']])
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: [],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(remote.written).toHaveLength(0)
    expect(remote.conflictsWritten).toHaveLength(1)
    expect(remote.conflictsWritten[0]!.key).toBe('b')
  })

  it('clones deep enough to find a prior orphaned batch', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
    })
    expect(remote.cloneDepth).toBeGreaterThan(1)
  })
})
