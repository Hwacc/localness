import { createError } from 'h3'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { authenticatedRemoteUrl } from './credentials'

const execFileAsync = promisify(execFile)

function redactGitError(message: string, token: string, authUrl: string) {
  let out = message
  for (const secret of [token, encodeURIComponent(token), authUrl]) {
    if (secret) out = out.split(secret).join('***')
  }
  return out.slice(0, 300)
}

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  })
  return stdout.trim()
}

/**
 * Remote branch head without transferring any objects — a bare protocol
 * handshake. Used to check whether a preview snapshot is still current.
 */
export async function remoteHeadSha(params: {
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
}): Promise<string> {
  const authUrl = authenticatedRemoteUrl(
    params.remoteUrl,
    params.credentialKind,
    params.token
  )
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', authUrl, `refs/heads/${params.branch}`],
      {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      }
    )
    const sha = stdout.trim().split(/\s+/)[0] ?? ''
    if (!sha) {
      throw new Error(`Branch ${params.branch} not found on remote`)
    }
    return sha
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : 'Git ls-remote failed'
    throw createError({
      statusCode: 502,
      statusMessage: redactGitError(raw, params.token, authUrl),
    })
  }
}

/** True for errors already shaped by `createError` — pass those through as-is. */
function isHttpError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  )
}

export async function withClonedRepo<T>(params: {
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
  sparsePath?: string
  /** History depth to fetch. Deeper clones let us search for prior commits. */
  depth?: number
  run: (repoDir: string, commitSha: string) => Promise<T>
}): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'localness-git-'))
  const authUrl = authenticatedRemoteUrl(
    params.remoteUrl,
    params.credentialKind,
    params.token
  )
  try {
    await cloneRepo(dir, authUrl, params.branch, params.sparsePath, params.depth)
    const sha = await git(dir, ['rev-parse', 'HEAD'])
    return await params.run(dir, sha)
  } catch (error: unknown) {
    // A deliberate 409/400 raised inside `run` must not be flattened into a
    // generic 502 — the client needs to tell "redo the preview" apart from
    // "the remote is unreachable".
    if (isHttpError(error)) throw error
    const raw =
      error instanceof Error ? error.message : 'Git operation failed'
    throw createError({
      statusCode: 502,
      statusMessage: redactGitError(raw, params.token, authUrl),
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function cloneRepo(
  dir: string,
  authUrl: string,
  branch: string,
  sparsePath?: string,
  depth = 1
) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  const timeout = 120_000
  const maxBuffer = 20 * 1024 * 1024
  const depthArgs = ['--depth', String(depth)]
  if (sparsePath) {
    try {
      await execFileAsync(
        'git',
        [
          'clone',
          ...depthArgs,
          '--sparse',
          '--branch',
          branch,
          authUrl,
          dir,
        ],
        { env, timeout, maxBuffer }
      )
      await git(dir, ['sparse-checkout', 'set', sparsePath])
      return
    } catch (error: unknown) {
      // Falling back to a full clone is much more expensive than the sparse
      // path, so make the reason visible instead of swallowing it.
      console.warn(
        '[git-sync] sparse checkout failed, falling back to full clone:',
        redactGitError(
          error instanceof Error ? error.message : String(error),
          '',
          authUrl
        )
      )
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
    }
  }
  await execFileAsync(
    'git',
    ['clone', ...depthArgs, '--branch', branch, authUrl, dir],
    { env, timeout, maxBuffer }
  )
}

/**
 * Looks for a commit carrying `trailer` in the fetched history. Used to detect
 * a batch that reached the remote but whose bookkeeping transaction never
 * committed, so a retry reconciles instead of pushing the same batch twice.
 *
 * Only sees as far back as the clone depth — a miss means "not in recent
 * history", not a hard "never pushed".
 */
export async function findCommitByTrailer(
  repoDir: string,
  trailer: string
): Promise<string | null> {
  const out = await git(repoDir, [
    'log',
    '--format=%H%x00%B%x1e',
    `--grep=${trailer}`,
    '--fixed-strings',
  ])
  if (!out) return null
  for (const entry of out.split('\x1e')) {
    const [sha, body] = entry.trim().split('\x00')
    // `--grep` matches anywhere; require the trailer on its own line so
    // preview 1 does not match preview 11.
    if (sha && body?.split('\n').some((line) => line.trim() === trailer)) {
      return sha
    }
  }
  return null
}

export type CommitAndPushResult =
  | { pushed: false }
  | { pushed: true; commitSha: string }

export async function commitAndPush(params: {
  repoDir: string
  message: string
  authorName: string
}): Promise<CommitAndPushResult> {
  await git(params.repoDir, ['config', 'user.email', 'git-sync@localness'])
  await git(params.repoDir, ['config', 'user.name', params.authorName])
  await git(params.repoDir, ['add', '-A'])
  const status = await git(params.repoDir, ['status', '--porcelain'])
  if (!status) return { pushed: false }
  await git(params.repoDir, ['commit', '-m', params.message])
  try {
    await git(params.repoDir, ['push'])
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : String(error)
    // The remote moved between our clone and our push. That is a routine race,
    // not a broken remote, and the fix is a fresh preview.
    if (/non-fast-forward|fetch first|rejected/i.test(raw)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Remote changed during push — run a new preview',
      })
    }
    throw error
  }
  return { pushed: true, commitSha: await git(params.repoDir, ['rev-parse', 'HEAD']) }
}
