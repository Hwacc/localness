import { describe, expect, it, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  binding: null as Record<string, unknown> | null,
  previews: [] as Record<string, unknown>[],
  transactions: 0,
}))

const remote = vi.hoisted(() => ({ headSha: 'sha-preview' }))

vi.mock('#server/libs/prisma', () => {
  const tx = {
    i18nKey: { upsert: async () => ({ id: 1 }) },
    localeValue: { upsert: async () => ({}) },
    gitSyncBase: { upsert: async () => ({}), findMany: async () => [] },
    gitSyncConflict: { upsert: async () => ({}), count: async () => 0 },
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

const { applyPull } = await import('#server/libs/git-sync/sync')

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
    // 'b' is a conflict but was not selected, so it must not be recorded.
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en'],
    })
    expect(result.applied).toBe(1)
    expect(result.conflicts).toBe(0)
  })

  it('records a conflict when the user keeps it selected', async () => {
    const result = await applyPull({
      projectId: 2,
      previewId: 1,
      selectedFiles: ['cortex/source/a.json'],
      selectedKeys: ['a\0en', 'b\0en'],
    })
    expect(result.applied).toBe(1)
    expect(result.conflicts).toBe(1)
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
