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

export async function withClonedRepo<T>(params: {
  remoteUrl: string
  branch: string
  credentialKind: string
  token: string
  sparsePath?: string
  run: (repoDir: string, commitSha: string) => Promise<T>
}): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'localness-git-'))
  const authUrl = authenticatedRemoteUrl(
    params.remoteUrl,
    params.credentialKind,
    params.token
  )
  try {
    await cloneRepo(dir, authUrl, params.branch, params.sparsePath)
    const sha = await git(dir, ['rev-parse', 'HEAD'])
    return await params.run(dir, sha)
  } catch (error: unknown) {
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
  sparsePath?: string
) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  const timeout = 120_000
  const maxBuffer = 20 * 1024 * 1024
  if (sparsePath) {
    try {
      await execFileAsync(
        'git',
        [
          'clone',
          '--depth',
          '1',
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
      // Falling back to a full depth-1 clone is much more expensive than the
      // sparse path, so make the reason visible instead of swallowing it.
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
    ['clone', '--depth', '1', '--branch', branch, authUrl, dir],
    { env, timeout, maxBuffer }
  )
}

export async function commitAndPush(params: {
  repoDir: string
  message: string
  authorName: string
}) {
  await git(params.repoDir, ['config', 'user.email', 'git-sync@localness'])
  await git(params.repoDir, ['config', 'user.name', params.authorName])
  await git(params.repoDir, ['add', '-A'])
  const status = await git(params.repoDir, ['status', '--porcelain'])
  if (!status) return false
  await git(params.repoDir, ['commit', '-m', params.message])
  await git(params.repoDir, ['push'])
  return true
}
