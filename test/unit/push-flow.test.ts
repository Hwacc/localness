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
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    gitSyncConflict: { count: async () => db.conflicts },
    gitSyncBinding: { findUnique: async () => db.binding },
    project: { findUnique: async () => db.project },
    i18nKey: { findMany: async () => db.keys },
    gitSyncBase: { findMany: async () => db.bases },
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
}))

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
})

describe('previewPush', () => {
  it('writes nothing but a preview row', async () => {
    db.keys = [key('a', 'text')]
    await previewPush(2, 'tester')
    expect(db.created).toHaveLength(1)
    expect(db.created[0]!.status).toBe('pending')
  })

  it('explains an empty delta instead of failing', async () => {
    // Every key unchanged: the old behaviour was a bare 400.
    db.keys = [key('a', 'text'), key('b', 'other')]
    db.bases = [
      { key: 'a', baseText: 'text' },
      { key: 'b', baseText: 'other' },
    ]
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
    const preview = await previewPush(2, 'tester')
    const eligible = preview.candidates
      .filter((c) => c.eligible)
      .map((c) => c.key)
    expect(eligible).toEqual(['fresh', 'moved'])
    // Filtered keys are still returned so the UI can explain them.
    expect(preview.candidates).toHaveLength(5)
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
})
