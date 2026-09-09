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
    } catch {
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
