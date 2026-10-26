import { z } from 'zod/v4'
import {
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncConflictStatus,
  GitSyncFileFormat,
} from '#shared/constants'

export function isHttpsRemoteUrl(value: string): boolean {
  return normalizeGitHttpsRemote(value) != null
}

/** Bitbucket/GitHub browse pages are not clone URLs; turn them into https Git remotes. */
export function normalizeGitHttpsRemote(value: string): {
  remoteUrl: string
  branch?: string
} | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname) return null
  const host = url.hostname.toLowerCase()
  const pathname = url.pathname.replace(/\/+$/, '')
  const origin = `${url.protocol}//${url.host}`

  const bitbucket = pathname.match(
    /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:src|branch)\/([^/]+))?(?:\/.*)?$/i
  )
  if (
    bitbucket &&
    (host === 'bitbucket.org' || host.endsWith('.bitbucket.org'))
  ) {
    const workspace = bitbucket[1]!
    const repo = bitbucket[2]!.replace(/\.git$/i, '')
    if (!workspace || !repo) return null
    const branch = bitbucket[3]
      ? decodeURIComponent(bitbucket[3])
      : undefined
    return {
      remoteUrl: `${origin}/${workspace}/${repo}.git`,
      branch,
    }
  }

  const github = pathname.match(
    /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+))?(?:\/.*)?$/i
  )
  if (github && (host === 'github.com' || host === 'www.github.com')) {
    const owner = github[1]!
    const repo = github[2]!.replace(/\.git$/i, '')
    if (!owner || !repo) return null
    const branch = github[3] ? decodeURIComponent(github[3]) : undefined
    return {
      remoteUrl: `${origin}/${owner}/${repo}.git`,
      branch,
    }
  }

  if (pathname.toLowerCase().endsWith('.git')) {
    return { remoteUrl: `${origin}${pathname}` }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 2) {
    return {
      remoteUrl: `${origin}/${segments[0]}/${segments[1]}.git`,
    }
  }
  return null
}

export const zGitSyncBindingPut = z.object({
  enabled: z.boolean().optional(),
  adapter: z.enum(GitSyncAdapter).optional(),
  remoteUrl: z
    .string()
    .trim()
    .min(1)
    .refine(isHttpsRemoteUrl, 'Remote URL must be an https Git remote'),
  branch: z.string().min(1).optional(),
  product: z.string().trim().min(1),
  /** `locale-files` only; ignored by `lilt-swbu`. */
  options: z
    .object({
      pattern: z.string().trim().min(1).max(200).optional(),
      format: z.enum(GitSyncFileFormat).optional(),
    })
    .optional(),
  credentialKind: z.enum([
    GitCredentialKind.REPO_ACCESS_TOKEN,
    GitCredentialKind.API_TOKEN,
  ]),
  token: z.string().optional(),
})
export type ZGitSyncBindingPut = z.infer<typeof zGitSyncBindingPut>

export const zGitSyncDiscoverProducts = z.object({
  adapter: z.enum(GitSyncAdapter).optional(),
  remoteUrl: z
    .string()
    .trim()
    .min(1)
    .refine(isHttpsRemoteUrl, 'Remote URL must be an https Git remote'),
  branch: z.string().min(1).optional(),
  credentialKind: z.enum([
    GitCredentialKind.REPO_ACCESS_TOKEN,
    GitCredentialKind.API_TOKEN,
  ]),
  token: z.string().optional(),
})
export type ZGitSyncDiscoverProducts = z.infer<typeof zGitSyncDiscoverProducts>

export const zGitSyncConflictResolve = z.object({
  action: z.enum([
    GitSyncConflictStatus.OURS,
    GitSyncConflictStatus.THEIRS,
    GitSyncConflictStatus.MERGED,
    GitSyncConflictStatus.RENAMED,
  ]),
  text: z.string().optional(),
  /** Only for `renamed`: the name the platform's key moves to. */
  newKey: z.string().trim().min(1).optional(),
})
export type ZGitSyncConflictResolve = z.infer<typeof zGitSyncConflictResolve>
