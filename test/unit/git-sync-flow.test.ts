import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'
import {
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncErrorCode,
  GitSyncPushReason,
} from '#shared/constants'

/**
 * End-to-end over a real SQLite database (every migration applied) and a real
 * bare Git repository on disk, so preview → edit → apply sequences run against
 * the same state the server keeps between requests.
 */

const root = mkdtempSync(join(tmpdir(), 'localness-git-sync-flow-'))
const dbFile = join(root, 'flow.db')
const migrations = join(process.cwd(), 'prisma', 'migrations')
const sqlite = new Database(dbFile)
for (const dir of readdirSync(migrations).filter((name) => /^\d/.test(name)).sort()) {
  sqlite.exec(readFileSync(join(migrations, dir, 'migration.sql'), 'utf8'))
}
sqlite.close()
process.env.DATABASE_URL = `file:${dbFile}`

const { default: prisma } = await import('#server/libs/prisma')
const {
  applyPull,
  applyPush,
  bindingLocationChanged,
  listOpenConflicts,
  previewPull,
  previewPush,
  resetGitSyncState,
  resolveConflict,
} = await import('#server/libs/git-sync/sync')
const { withSyncLease } = await import('#server/libs/git-sync/engine/lease')

afterAll(async () => {
  await prisma.$disconnect()
  rmSync(root, { recursive: true, force: true })
})

function git(cwd: string, args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

let repoCount = 0

/** A bare remote plus a working clone used to author commits on it. */
function createRemote() {
  repoCount += 1
  const bare = join(root, `remote-${repoCount}.git`)
  const work = join(root, `work-${repoCount}`)
  git(root, ['init', '--bare', '-b', 'main', bare])
  git(root, ['init', '-b', 'main', work])
  git(work, ['remote', 'add', 'origin', pathToFileURL(bare).href])
  return {
    url: pathToFileURL(bare).href,
    commit(files: Record<string, unknown>, message = 'edit') {
      for (const [path, content] of Object.entries(files)) {
        const abs = join(work, path)
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, `${JSON.stringify(content, null, '\t')}\n`)
      }
      git(work, ['add', '-A'])
      git(work, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', message])
      git(work, ['push', '-u', 'origin', 'main'])
    },
  }
}

let projectCount = 0

async function createProject(params: {
  remoteUrl: string
  product?: string
  locales?: string[]
}) {
  projectCount += 1
  const team = await prisma.team.create({ data: { name: `team-${projectCount}` } })
  const project = await prisma.project.create({
    data: {
      name: `project-${projectCount}`,
      teamId: team.id,
      settings: {
        create: {
          ocrLanguage: 'eng',
          ocrEngine: 1,
          localeFallback: 'en',
          locales: params.locales ?? ['en', 'zh_cn'],
        },
      },
      gitSync: {
        create: {
          adapter: GitSyncAdapter.LILT_SWBU,
          remoteUrl: params.remoteUrl,
          branch: 'main',
          product: params.product ?? 'cortex',
          credentialKind: GitCredentialKind.REPO_ACCESS_TOKEN,
          token: 'token',
        },
      },
    },
  })
  return project.id
}

async function seedKey(params: {
  projectId: number
  key: string
  locale?: string
  draft: string
  published: string
  base?: string
}) {
  const locale = params.locale ?? 'en'
  await prisma.i18nKey.create({
    data: {
      projectId: params.projectId,
      key: params.key,
      locales: {
        create: {
          locale,
          draftText: params.draft,
          publishedText: params.published,
        },
      },
    },
  })
  if (params.base != null) {
    await prisma.gitSyncBase.create({
      data: {
        projectId: params.projectId,
        key: params.key,
        locale,
        baseText: params.base,
      },
    })
  }
}

async function localeRow(projectId: number, key: string, locale = 'en') {
  return prisma.localeValue.findFirst({
    where: { locale, i18nKey: { projectId, key } },
  })
}

async function editPlatform(projectId: number, key: string, text: string) {
  const row = await localeRow(projectId, key)
  await prisma.localeValue.update({
    where: { id: row!.id },
    data: { draftText: text, publishedText: text },
  })
}

async function openConflict(projectId: number, key: string) {
  return prisma.gitSyncConflict.findFirst({
    where: { projectId, key, status: 'open' },
  })
}

const SOURCE_V1 = 'cortex/source/20260101-aaaaaaaaaaaaaaaaaaaaaaaa_en-US.json'
const SOURCE_V2 = 'cortex/source/20260102-bbbbbbbbbbbbbbbbbbbbbbbb_en-US.json'

describe('git sync flow', { timeout: 60_000 }, () => {
  it('does not overwrite a platform edit made after the pull preview', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })

    const preview = await previewPull(projectId, 'tester')
    expect(preview.candidates).toMatchObject([{ key: 'greeting', decision: 'apply-theirs' }])

    await editPlatform(projectId, 'greeting', 'Hi, edited after preview')
    await applyPull({
      projectId,
      triggeredBy: 'tester',
      previewId: preview.previewId,
      selectedFiles: [SOURCE_V1],
      selectedKeys: ['greeting\0en'],
    }).catch(() => null)

    expect((await localeRow(projectId, 'greeting'))!.draftText).toBe('Hi, edited after preview')
  })

  it('closes a conflict card once Git and the platform agree again', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { title: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })

    await previewPull(projectId, 'tester')
    expect(await openConflict(projectId, 'title')).not.toBeNull()

    remote.commit({ [SOURCE_V2]: { title: 'Platform' } })
    await previewPull(projectId, 'tester')

    expect(await openConflict(projectId, 'title')).toBeNull()
    await expect(previewPush(projectId, 'tester')).resolves.toBeTruthy()
  })

  it('"Use platform" keeps a platform edit made after the card was written', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { title: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })

    await previewPull(projectId, 'tester')
    const card = await openConflict(projectId, 'title')
    await editPlatform(projectId, 'title', 'Platform v2')
    await resolveConflict({ projectId, conflictId: card!.id, action: 'ours' })

    expect((await localeRow(projectId, 'title'))!.publishedText).toBe('Platform v2')
  })

  it('"Use platform" on a pull conflict does not publish an unpublished draft', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { cta: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'cta', draft: 'Draft WIP', published: 'Published', base: 'Published' })

    await previewPull(projectId, 'tester')
    const card = await openConflict(projectId, 'cta')
    expect(card).not.toBeNull()
    await resolveConflict({ projectId, conflictId: card!.id, action: 'ours' })

    expect((await localeRow(projectId, 'cta'))!.publishedText).toBe('Published')
  })

  it('"Use platform" on a push conflict keeps the unpublished draft', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { cta: 'Git edit' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({
      projectId,
      key: 'cta',
      draft: 'Draft WIP',
      published: 'Published v2',
      base: 'Published v1',
    })

    const preview = await previewPush(projectId, 'tester')
    expect(preview.candidates).toMatchObject([{ key: 'cta', reason: GitSyncPushReason.CONFLICT }])
    const card = await openConflict(projectId, 'cta')
    await resolveConflict({ projectId, conflictId: card!.id, action: 'ours' })

    expect((await localeRow(projectId, 'cta'))!.draftText).toBe('Draft WIP')
  })

  it('proposes every key again after the binding moves to a new folder', async () => {
    const remote = createRemote()
    remote.commit({
      [SOURCE_V1]: { k1: 'One' },
      'cortex2/source/20260101-cccccccccccccccccccccccc_en-US.json': { other: 'x' },
    })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'k1', draft: 'One', published: 'One', base: 'One' })

    // What `PUT /git-sync` does when the folder changes.
    const before = await prisma.gitSyncBinding.findUniqueOrThrow({ where: { projectId } })
    const after = await prisma.gitSyncBinding.update({
      where: { projectId },
      data: { product: 'cortex2' },
    })
    expect(bindingLocationChanged(before, after)).toBe(true)
    await resetGitSyncState(projectId, prisma)
    const preview = await previewPush(projectId, 'tester')

    expect(preview.candidates).toMatchObject([
      { key: 'k1', reason: GitSyncPushReason.NEW_KEY, eligible: true },
    ])
  })

  it('does not pull a locale the project does not have', async () => {
    const remote = createRemote()
    remote.commit({
      [SOURCE_V1]: { k1: 'Hello' },
      'cortex/translated/20260101-aaaaaaaaaaaaaaaaaaaaaaaa_ja-JP.json': { k1: 'こんにちは' },
    })
    const projectId = await createProject({ remoteUrl: remote.url, locales: ['en', 'zh_cn'] })
    await seedKey({ projectId, key: 'k1', draft: 'Hello', published: 'Hello', base: 'Hello' })

    const preview = await previewPull(projectId, 'tester')

    expect(preview.candidates.map((c) => c.locale)).not.toContain('ja')
    expect(preview.ignoredLocales).toEqual(['ja'])
  })

  it('lets only one of two concurrent resolves land', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { title: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })
    await previewPull(projectId, 'tester')
    const card = await openConflict(projectId, 'title')

    const outcomes = await Promise.allSettled([
      resolveConflict({ projectId, conflictId: card!.id, action: 'theirs' }),
      resolveConflict({ projectId, conflictId: card!.id, action: 'merged', text: 'Merged' }),
    ])

    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected'])
    const logs = await prisma.gitSyncLog.count({ where: { projectId, action: 'conflict-resolve' } })
    expect(logs).toBe(1)
  })

  it('reconciles an orphaned push with the text that commit holds', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { k1: 'Before' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'k1', draft: 'Pushed', published: 'Pushed', base: 'Before' })
    const preview = await previewPush(projectId, 'tester')

    // The batch landed but its bookkeeping never committed; since then the
    // platform moved on.
    remote.commit(
      { [SOURCE_V2]: { k1: 'Pushed' } },
      `localness: source batch\n\nLocalness-Preview: ${preview.previewId}`
    )
    await editPlatform(projectId, 'k1', 'Edited later')
    const result = await applyPush({
      projectId,
      previewId: preview.previewId,
      selectedKeys: ['k1'],
      triggeredBy: 'tester',
    })

    expect(result.reconciled).toBe(true)
    const base = await prisma.gitSyncBase.findFirst({ where: { projectId, key: 'k1' } })
    expect(base!.baseText).toBe('Pushed')
  })

  it('keeps a pull preview valid when only another product folder moved', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })

    const preview = await previewPull(projectId, 'tester')
    remote.commit({ 'other/source/20260101-dddddddddddddddddddddddd_en-US.json': { x: 'y' } })
    const result = await applyPull({
      projectId,
      triggeredBy: 'tester',
      previewId: preview.previewId,
      selectedFiles: [SOURCE_V1],
      selectedKeys: ['greeting\0en'],
    })

    expect(result.applied).toBe(1)
    expect((await localeRow(projectId, 'greeting'))!.publishedText).toBe('Hello there')
  })

  it('applies other keys while a conflict is open, and holds rows of the conflicted key', async () => {
    const remote = createRemote()
    const translated = 'cortex/translated/20260101-aaaaaaaaaaaaaaaaaaaaaaaa_zh-CN.json'
    remote.commit({
      [SOURCE_V1]: { title: 'Git', k2: 'Two from Git' },
      [translated]: { title: '标题' },
    })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })
    await seedKey({ projectId, key: 'k2', draft: 'Two', published: 'Two', base: 'Two' })

    const preview = await previewPull(projectId, 'tester')
    expect(await openConflict(projectId, 'title')).not.toBeNull()
    const result = await applyPull({
      projectId,
      triggeredBy: 'tester',
      previewId: preview.previewId,
      selectedFiles: [SOURCE_V1, translated],
      selectedKeys: ['k2\0en', 'title\0zh_cn'],
    })

    expect(result.applied).toBe(1)
    expect(result.blocked).toEqual([{ key: 'title', locale: 'zh_cn' }])
    expect((await localeRow(projectId, 'k2'))!.publishedText).toBe('Two from Git')
    expect(await localeRow(projectId, 'title', 'zh_cn')).toBeNull()
  })

  it('treats a key missing from the remote as no opinion on push', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { other: 'Other' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'k1', draft: 'Hello v2', published: 'Hello v2', base: 'Hello' })

    const preview = await previewPush(projectId, 'tester')
    const row = preview.candidates.find((c) => c.key === 'k1')

    expect(row?.reason).not.toBe(GitSyncPushReason.CONFLICT)
    expect(row?.eligible).toBe(true)
    expect(await openConflict(projectId, 'k1')).toBeNull()
  })

  it('says who replaced a pull preview', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })

    const first = await previewPull(projectId, 'alice')
    await previewPull(projectId, 'bob')

    await expect(
      applyPull({
        projectId,
        triggeredBy: 'alice',
        previewId: first.previewId,
        selectedFiles: [SOURCE_V1],
        selectedKeys: ['greeting\0en'],
      })
    ).rejects.toMatchObject({
      statusMessage: expect.stringContaining('newer preview by bob'),
      data: { code: GitSyncErrorCode.PREVIEW_REPLACED },
    })
  })

  it('refuses an apply while another sync holds the lease, and takes an expired one', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })
    const preview = await previewPull(projectId, 'bob')
    const apply = () =>
      applyPull({
        projectId,
        triggeredBy: 'bob',
        previewId: preview.previewId,
        selectedFiles: [SOURCE_V1],
        selectedKeys: ['greeting\0en'],
      })

    await withSyncLease(projectId, 'alice', async () => {
      await expect(apply()).rejects.toMatchObject({
        statusCode: 409,
        statusMessage: expect.stringContaining('alice is syncing'),
        data: { code: GitSyncErrorCode.SYNC_BUSY },
      })
    })
    // A holder that died: its lease lapsed without a release.
    await prisma.gitSyncBinding.update({
      where: { projectId },
      data: { leaseId: 'dead', leaseOwner: 'alice', leaseUntil: new Date(Date.now() - 1000) },
    })

    await expect(apply()).resolves.toMatchObject({ applied: 1 })
    const binding = await prisma.gitSyncBinding.findUniqueOrThrow({ where: { projectId } })
    expect(binding.leaseUntil).toBeNull()
  })

  it('lands one of two concurrent applies of the same preview', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })
    const preview = await previewPull(projectId, 'tester')
    const apply = () =>
      applyPull({
        projectId,
        triggeredBy: 'tester',
        previewId: preview.previewId,
        selectedFiles: [SOURCE_V1],
        selectedKeys: ['greeting\0en'],
      })

    const outcomes = await Promise.allSettled([apply(), apply()])

    expect(outcomes.map((o) => o.status).sort()).toEqual(['fulfilled', 'rejected'])
    const logs = await prisma.gitSyncLog.count({ where: { projectId, action: 'pull-apply' } })
    expect(logs).toBe(1)
  })

  it('writes nothing when the binding moved on after the preview', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { greeting: 'Hello there' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'greeting', draft: 'Hello', published: 'Hello', base: 'Hello' })
    const preview = await previewPull(projectId, 'tester')
    // What a move leaves behind if it lands between preview and apply without
    // cancelling the preview: only the generation tells them apart.
    await prisma.gitSyncBinding.update({
      where: { projectId },
      data: { generation: { increment: 1 } },
    })

    await expect(
      applyPull({
        projectId,
        triggeredBy: 'tester',
        previewId: preview.previewId,
        selectedFiles: [SOURCE_V1],
        selectedKeys: ['greeting\0en'],
      })
    ).rejects.toMatchObject({ data: { code: GitSyncErrorCode.BINDING_CHANGED } })
    expect((await localeRow(projectId, 'greeting'))!.publishedText).toBe('Hello')
  })

  it('records a push whose apply died after the commit, at the next push preview', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { k1: 'Before' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'k1', draft: 'Pushed', published: 'Pushed', base: 'Before' })
    const first = await previewPush(projectId, 'tester')
    // The commit landed; the process died before its bookkeeping.
    await prisma.gitSyncPreview.update({
      where: { id: first.previewId },
      data: { status: 'pushing', result: { keys: ['k1'] } },
    })
    remote.commit(
      { [SOURCE_V2]: { k1: 'Pushed' } },
      `localness: source batch\n\nLocalness-Preview: ${first.previewId}`
    )

    const next = await previewPush(projectId, 'tester')

    const settled = await prisma.gitSyncPreview.findUniqueOrThrow({ where: { id: first.previewId } })
    expect(settled.status).toBe('applied')
    const base = await prisma.gitSyncBase.findFirst({ where: { projectId, key: 'k1' } })
    expect(base!.baseText).toBe('Pushed')
    expect(next.candidates.find((c) => c.key === 'k1')?.reason).toBe(GitSyncPushReason.UNCHANGED)
  })

  it('cancels an interrupted push that never reached the remote', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { k1: 'Before' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'k1', draft: 'Pushed', published: 'Pushed', base: 'Before' })
    const first = await previewPush(projectId, 'tester')
    await prisma.gitSyncPreview.update({
      where: { id: first.previewId },
      data: { status: 'pushing', result: { keys: ['k1'] } },
    })

    const next = await previewPush(projectId, 'tester')

    const settled = await prisma.gitSyncPreview.findUniqueOrThrow({ where: { id: first.previewId } })
    expect(settled.status).toBe('cancelled')
    expect(next.candidates.find((c) => c.key === 'k1')?.reason).toBe(GitSyncPushReason.CHANGED)
  })

  it('stops showing a card once the platform text moved on', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { title: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })
    await previewPull(projectId, 'tester')
    const card = await openConflict(projectId, 'title')

    await editPlatform(projectId, 'title', 'Platform v2')

    expect(await listOpenConflicts(projectId)).toEqual([])
    const row = await prisma.gitSyncConflict.findUniqueOrThrow({ where: { id: card!.id } })
    expect(row.status).toBe('obsolete')
  })

  it('refuses "Use Git" on a card whose platform text moved on', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { title: 'Git' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    await seedKey({ projectId, key: 'title', draft: 'Platform', published: 'Platform', base: 'Base' })
    await previewPull(projectId, 'tester')
    const card = await openConflict(projectId, 'title')
    await editPlatform(projectId, 'title', 'Platform v2')

    await expect(
      resolveConflict({ projectId, conflictId: card!.id, action: 'theirs' })
    ).rejects.toMatchObject({ data: { code: GitSyncErrorCode.CONFLICT_STALE } })
    expect((await localeRow(projectId, 'title'))!.publishedText).toBe('Platform v2')
    const row = await prisma.gitSyncConflict.findUniqueOrThrow({ where: { id: card!.id } })
    expect(row.status).toBe('obsolete')
  })

  it('bumps the generation when the binding moves', async () => {
    const remote = createRemote()
    remote.commit({ [SOURCE_V1]: { k1: 'One' } })
    const projectId = await createProject({ remoteUrl: remote.url })
    const before = await prisma.gitSyncBinding.findUniqueOrThrow({ where: { projectId } })

    await resetGitSyncState(projectId, prisma)

    const after = await prisma.gitSyncBinding.findUniqueOrThrow({ where: { projectId } })
    expect(after.generation).toBe(before.generation + 1)
  })
})
