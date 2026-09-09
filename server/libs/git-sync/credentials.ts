import { createError } from 'h3'
import {
  GitCredentialKind,
  GIT_HTTPS_SENTINEL,
  LILT_DEFAULT_LOCALE_MAP,
} from '#shared/constants'

function parseCredentialKind(kind: string): GitCredentialKind {
  switch (kind) {
    case GitCredentialKind.REPO_ACCESS_TOKEN:
      return GitCredentialKind.REPO_ACCESS_TOKEN
    case GitCredentialKind.API_TOKEN:
      return GitCredentialKind.API_TOKEN
    default:
      throw createError({
        statusCode: 400,
        statusMessage: 'Unknown credential kind',
      })
  }
}

export function gitHttpsSentinel(kind: string): string {
  const parsed = parseCredentialKind(kind)
  switch (parsed) {
    case GitCredentialKind.REPO_ACCESS_TOKEN:
      return GIT_HTTPS_SENTINEL[GitCredentialKind.REPO_ACCESS_TOKEN]
    case GitCredentialKind.API_TOKEN:
      return GIT_HTTPS_SENTINEL[GitCredentialKind.API_TOKEN]
    default: {
      const _exhaustive: never = parsed
      return _exhaustive
    }
  }
}

export function authenticatedRemoteUrl(
  remoteUrl: string,
  kind: string,
  token: string
): string {
  const url = new URL(remoteUrl)
  url.username = gitHttpsSentinel(kind)
  url.password = token
  return url.toString()
}

const inboundAliases: Record<string, string> = {
  'zh-tw': 'zh_tw',
  'zt-TW': 'zh_tw',
  'zt-tw': 'zh_tw',
}

export function localeToRemote(
  local: string,
  override?: Record<string, string> | null
): string {
  if (override?.[local]) return override[local]
  return LILT_DEFAULT_LOCALE_MAP[local] ?? local
}

export function remoteToLocale(
  remote: string,
  override?: Record<string, string> | null
): string | null {
  if (override) {
    for (const [local, mapped] of Object.entries(override)) {
      if (mapped.toLowerCase() === remote.toLowerCase()) return local
    }
  }
  const aliased = inboundAliases[remote] ?? inboundAliases[remote.toLowerCase()]
  if (aliased) return aliased
  const hit = Object.entries(LILT_DEFAULT_LOCALE_MAP).find(
    ([, bcp]) => bcp.toLowerCase() === remote.toLowerCase()
  )
  return hit?.[0] ?? null
}
