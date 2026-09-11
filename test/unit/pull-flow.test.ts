import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  binding: null as Record<string, unknown> | null,
  previews: [] as Record<string, unknown>[],
  transactions: 0,
  localeWrites: [] as Record<string, unknown>[],
  basesWritten: [] as Record<string, unknown>[],
  conflictRow: null as { status: string } | null,
  openConflict: null as Record<string, unknown> | null,
}))

const remote = vi.hoisted(() => ({ headSha: 'sha-preview' }))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    i18nKey: { upsert: async () => ({ id: 1 }) },
    localeValue: {
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        db.localeWrites.push({ create, update })
        return {}
      },
    },
    gitSyncBase: {
      upsert: async ({
        create,
        update,
      }: {
        create: Record<string, unknown>
        update: Record<string, unknown>
      }) => {
        db.basesWritten.push({ create, update })
        return {}
      },
      findMany: async () => [],
    },
    gitSyncConflict: {
      upsert: async () => ({}),
      count: async () => 0,
      findFirst: async ({
        where,
      }: {
        where: Record<string, unknown>
      }) => {
        if ('id' in where) return db.openConflict
        return db.conflictRow
      },
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    gitSyncBinding: { update: async () => ({}) },
    gitSyncPreview: { update: async () => ({}) },
  }
  return {
    default: {
      ...tx,
      gitSyncBinding: {
        findUnique: async () => db.binding,
        update: async () => ({}),
      },
      gitSyncPreview: {
        findFirst: async ({ where }: { where: { id: number } }) =>
          db.previews.find((p) => p.id === where.id) ?? null,
        update: async () => ({}),
      },
      $transaction: async (fn: (c: unknown) => Promise<void>) => {
        db.transactions += 1
        return fn(tx)
      },
    },
  }
})

vi.mock('#server/libs/git-sync/git-remote', () => ({
  remoteHeadSha: async () => remote.headSha,
  withClonedRepo: async () => {
    throw new Error('apply must not clone when the head is unchanged')
  },
  commitAndPush: async () => ({ pushed: true, commitSha: 'sha-pushed' }),
  findCommitByTrailer: async () => null,
}))

const { applyPull, resolveConflict } = await import(
  '#server/libs/git-sync/sync'
)

const snapshot = {
  files: [{ relPath: 'cortex/source/a.json', sha: 'blob1' }],
  candidates: [
    {
      key: 'a',
      locale: 'en',
      baseText: '',
      oursText: '',
      theirsText: 'Git text',
      publishedText: null,
      decision: 'apply-theirs',
    },
    {
      key: 'b',
      locale: 'en',
      baseText: 'base',
      oursText: 'ours',
      theirsText: 'theirs',
      publishedText: null,
      decision: 'conflict',
    },
  ],
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    kind: 'pull',
    status: 'pending',
    commitSha: 'sha-preview',
    expiresAt: new Date(Date.now() + 60_000),
    candidates: snapshot,
    ...overrides,
  }
}

beforeEach(() => {
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
  db.previews = [pending()]
  db.transactions = 0
  db.localeWrites = []
  db.basesWritten = []
  db.conflictRow = { status: 'theirs' }
  db.openConflict = null
  remote.headSha = 'sha-preview'
})

describe('applyPull', () => {
  it('reuses the snapshot without cloning when the head is unchanged', async () => {
    // The git-remote mock throws if `withClonedRepo` is called.
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en'],
    })
    expect(result.applied).toBe(1)
    expect(db.transactions).toBe(1)
  })

  it('refuses when the remote moved since the preview', async () => {
    remote.headSha = 'sha-moved'
    await expect(
      applyPull({
        projectId: 2,
        previewId: 1,
        selectedFiles: ['cortex/source/a.json'],
        selectedKeys: ['a\0en'],
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('applies only the selected keys', async () => {
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en'],
    })
    expect(result.applied).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('refuses apply while a preview conflict card is still open', async () => {
    db.conflictRow = { status: 'open' }
    await expect(
      applyPull({
        projectId: 2,
        previewId: 1,
        selectedFiles: ['cortex/source/a.json'],
        selectedKeys: ['a\0en'],
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(db.transactions).toBe(0)
  })

  it('applies Git-ahead rows after the conflict card is resolved', async () => {
    db.conflictRow = { status: 'theirs' }
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en'],
    })
    expect(result.applied).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('publishes apply-theirs rows instead of leaving them as draft', async () => {
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en'],
    })
    expect(result.applied).toBe(1)
    expect(result.conflicts).toBe(0)
    expect(db.localeWrites).toHaveLength(1)
    expect(db.localeWrites[0]!.create).toMatchObject({
      draftText: 'Git text',
      publishedText: 'Git text',
    })
    expect(db.localeWrites[0]!.update).toMatchObject({
      draftText: 'Git text',
      publishedText: 'Git text',
    })
  })

  it('rejects an empty selection', async () => {
    await expect(
      applyPull({
        projectId: 2,
        previewId: 1,
        selectedFiles: [],
        selectedKeys: [],
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects an expired preview', async () => {
    db.previews = [pending({ expiresAt: new Date(Date.now() - 1000) })]
    await expect(
      applyPull({
        projectId: 2,
        previewId: 1,
        selectedFiles: ['cortex/source/a.json'],
        selectedKeys: ['a\0en'],
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('counts only files the user accepted as seen', async () => {
    // Selecting no files but keeping a key means the file stays a candidate.
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: [],
      selectedKeys: ['a\0en'],
    })
    expect(result.files).toBe(0)
  })
})

describe('resolveConflict', () => {
  beforeEach(() => {
    db.openConflict = {
      id: 9,
      projectId: 2,
      key: 'cortex_mobile_desc',
      locale: 'en-US',
      status: 'open',
      baseText: 'base',
      oursText: 'platform',
      theirsText: 'git',
      publishedText: 'platform',
    }
  })

  it('keeps Git as the last-seen base when using platform text', async () => {
    await resolveConflict({
      projectId: 2,
      conflictId: 9,
      action: 'ours',
    })
    expect(db.localeWrites[0]!.update).toMatchObject({
      draftText: 'platform',
      publishedText: 'platform',
    })
    expect(db.basesWritten[0]!.update).toMatchObject({ baseText: 'git' })
  })

  it('writes Git text and Git base when using Git', async () => {
    await resolveConflict({
      projectId: 2,
      conflictId: 9,
      action: 'theirs',
    })
    expect(db.localeWrites[0]!.update).toMatchObject({
      draftText: 'git',
      publishedText: 'git',
    })
    expect(db.basesWritten[0]!.update).toMatchObject({ baseText: 'git' })
  })
})
