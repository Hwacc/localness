import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitSyncErrorCode } from '#shared/constants'

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
  /** A newer preview cancelled this one after apply loaded it. */
  previewLost: false,
  logs: [] as Record<string, unknown>[],
}))

/** Records what the fake remote was asked to do. */
const remote = vi.hoisted(() => ({
  /** Sha returned by `findCommitByTrailer`; null means "no prior batch". */
  orphanSha: null as string | null,
  /** Clone dir handed to `run`; a real temp dir for `locale-files` cases. */
  repoDir: '/tmp/fake-repo',
  written: [] as Record<string, string>[],
  commits: [] as string[],
  cloneDepth: undefined as number | undefined,
  source: new Map<string, string>(),
  conflictsWritten: [] as Record<string, unknown>[],
}))

vi.mock('#server/libs/git-sync/remote/git-remote', () => ({
  remoteHeadSha: async () => 'sha-head',
  withClonedRepo: async (params: {
    depth?: number
    run: (dir: string, sha: string) => Promise<unknown>
  }) => {
    remote.cloneDepth = params.depth
    return params.run(remote.repoDir, 'sha-clone')
  },
  findCommitByTrailer: async () => remote.orphanSha,
  // `remote.source` stands for the orphan commit's tree once checked out.
  checkoutCommit: async () => {},
  commitAndPush: async (params: { message: string }) => {
    remote.commits.push(params.message)
    return { pushed: true, commitSha: 'sha-new-commit' }
  },
}))

vi.mock('#server/libs/git-sync/layouts/lilt-swbu/batches', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('#server/libs/git-sync/layouts/lilt-swbu/batches')>()
  return {
    ...actual,
    writeSourceBatch: async (params: { entries: Record<string, string> }) => {
      remote.written.push(params.entries)
      return 'en_2026-09-10.json'
    },
    readMergedSourceLocale: async () => remote.source,
  }
})

vi.mock('#server/helper/api-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/helper/api-delivery')>()),
  projectLocales: async () => ['en', 'de'],
}))

// The lease is a conditional update on the binding row; git-sync-flow covers it.
vi.mock('#server/libs/git-sync/engine/lease', () => ({
  withSyncLease: (_projectId: number, _owner: string, run: () => Promise<unknown>) => run(),
  assertNoSyncRunning: async () => {},
}))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    gitSyncBinding: {
      findUnique: async () => db.binding,
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
    gitSyncLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.logs.push(data)
        return {}
      },
    },
  }
  return {
    default: {
      gitSyncConflict: {
        count: async () => db.conflicts,
        // No live platform row and an empty `oursText`: each card still holds.
        findMany: async () =>
          Array.from({ length: db.conflicts }, (_, id) => ({
            id,
            key: `open-${id}`,
            locale: 'en',
            oursText: '',
          })),
        updateMany: async () => ({ count: 0 }),
        upsert: async ({ create }: { create: Record<string, unknown> }) => {
          remote.conflictsWritten.push(create)
          return {}
        },
      },
      gitSyncBinding: { findUnique: async () => db.binding },
      projectSettings: { findUnique: async () => db.project?.settings ?? null },
      i18nKey: { findMany: async () => db.keys },
      gitSyncBase: { findMany: async () => db.bases },
      localeValue: { findMany: async () => [] },
      $transaction: async (fn: (c: unknown) => Promise<void>) => fn(tx),
      gitSyncPreview: {
        findMany: async () => [],
        // Only an apply's claim names the status it moves from; the cancel of
        // older previews matches none here.
        updateMany: async ({ where }: { where: { status?: { in?: string[] } } }) => ({
          count: where.status?.in && !db.previewLost ? 1 : 0,
        }),
        findUnique: async () => ({ status: 'cancelled' }),
        findFirst: async ({ where }: { where: { id: number | { gt: number } } }) =>
          typeof where.id === 'object'
            ? { createdBy: 'bob' }
            : (db.previews.find((p) => p.id === where.id) ?? null),
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
    adapter: 'lilt-swbu',
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
  db.previewLost = false
  db.logs = []
  remote.orphanSha = null
  remote.repoDir = '/tmp/fake-repo'
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

  it('stops before pushing when a newer preview replaced this one', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    db.previewLost = true
    await expect(
      applyPush({
        projectId: 2,
        previewId: 1,
        selectedKeys: ['a'],
        triggeredBy: 't',
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      data: { code: GitSyncErrorCode.PREVIEW_REPLACED },
    })
    expect(remote.commits).toHaveLength(0)
    expect(db.basesWritten).toHaveLength(0)
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
    remote.source = new Map([['a', 'text']])
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

  it('logs the batch it committed', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
      userId: 7,
    })
    expect(db.logs).toHaveLength(1)
    expect(db.logs[0]).toMatchObject({
      action: 'push-apply',
      status: 'success',
      previewId: 1,
      commitSha: 'sha-new-commit',
      userID: 7,
      detail: {
        filename: 'en_2026-09-10.json',
        count: 1,
        keys: ['a'],
        reconciled: false,
        conflicts: 0,
      },
    })
  })

  it('logs a partial push with skip reasons collapsed to counts', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text'), key('same', 'kept')]
    db.bases = [{ key: 'same', baseText: 'kept' }]
    remote.source = new Map([['same', 'kept']])
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a', 'same'],
      triggeredBy: 't',
      userId: 7,
    })
    expect(db.logs[0]).toMatchObject({
      status: 'partial',
      detail: { keys: ['a'], skipped: { unchanged: 1 } },
    })
  })

  it('logs a refused apply when only conflicts are left', async () => {
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
        userId: 7,
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(db.logs).toHaveLength(1)
    expect(db.logs[0]).toMatchObject({
      action: 'push-apply',
      status: 'refused',
      detail: { count: 0, keys: [], conflicts: 1 },
    })
  })

  it('logs a reconciled batch as a push landing', async () => {
    db.previews = [pending]
    db.keys = [key('a', 'text')]
    remote.orphanSha = 'sha-orphan'
    remote.source = new Map([['a', 'text']])
    await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['a'],
      triggeredBy: 't',
      userId: 7,
    })
    expect(db.logs[0]).toMatchObject({
      action: 'push-apply',
      status: 'success',
      commitSha: 'sha-orphan',
      detail: { reconciled: true, keys: ['a'] },
    })
  })

  it('does not log a preview', async () => {
    db.keys = [key('a', 'text')]
    await previewPush(2, 'tester')
    expect(db.logs).toHaveLength(0)
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

describe('locale-files adapter', () => {
  const pendingFor = (keys: string[]) => ({
    id: 1,
    kind: 'push',
    status: 'pending',
    commitSha: '',
    expiresAt: new Date(Date.now() + 60_000),
    candidates: {
      sourceLocale: 'en',
      candidates: keys.map((k) => ({ key: k, baseText: '', text: 'text' })),
    },
  })
  let sourcePath = ''

  beforeEach(async () => {
    remote.repoDir = await mkdtemp(join(tmpdir(), 'push-locale-files-'))
    await mkdir(join(remote.repoDir, 'locales'))
    sourcePath = join(remote.repoDir, 'locales', 'en.json')
    await writeFile(sourcePath, '{\n  "home": {\n    "title": "Home"\n  },\n  "label": "Label"\n}\n')
    db.binding = {
      ...db.binding,
      adapter: 'locale-files',
      product: 'locales',
      options: { pattern: '{locale}.json', format: 'nested-json' },
    }
  })

  afterEach(async () => {
    await rm(remote.repoDir, { recursive: true, force: true })
  })

  it('reads the source file as Git\'s side and flags keys it cannot hold', async () => {
    db.keys = [key('home.title', 'Start'), key('label.sub', 'x'), key('new.key', 'y')]
    db.bases = [{ key: 'home.title', baseText: 'Home' }]
    const preview = await previewPush(2, 'tester')
    const byKey = new Map(preview.candidates.map((c) => [c.key, c]))
    expect(byKey.get('home.title')).toMatchObject({ reason: 'changed', theirsText: 'Home', eligible: true })
    expect(byKey.get('label.sub')).toMatchObject({ reason: 'unwritable', eligible: false })
    expect(byKey.get('new.key')).toMatchObject({ reason: 'new-key', eligible: true })
    expect(preview.counts.unwritable).toBe(1)
  })

  it('rewrites the file in place, skips unwritable keys and records the real sha', async () => {
    db.previews = [pendingFor(['home.title', 'label.sub', 'new.key'])]
    db.keys = [key('home.title', 'Start'), key('label.sub', 'x'), key('new.key', 'y')]
    db.bases = [{ key: 'home.title', baseText: 'Home' }]
    const result = await applyPush({
      projectId: 2,
      previewId: 1,
      selectedKeys: ['home.title', 'label.sub', 'new.key'],
      triggeredBy: 't',
    })
    expect(result.filename).toBe('en.json')
    expect(result.skipped).toEqual([{ key: 'label.sub', reason: 'unwritable' }])
    expect(await readFile(sourcePath, 'utf8')).toBe(
      '{\n  "home": {\n    "title": "Start"\n  },\n  "label": "Label",\n  "new": {\n    "key": "y"\n  }\n}\n'
    )
    expect(remote.written).toHaveLength(0)
    expect(remote.commits[0]).toMatch(/^localness: update locales\/en\.json \(by t\)/)
    const seen = db.bindingUpdates[0]!.seenFiles as { path: string; sha: string }[]
    expect(seen).toHaveLength(1)
    expect(seen[0]!.path).toBe('locales/en.json')
    expect(seen[0]!.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(db.basesWritten.map((row) => row.key).sort()).toEqual(['home.title', 'new.key'])
  })
})
