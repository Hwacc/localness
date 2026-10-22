import { createError } from 'h3'
import {
  GitCredentialKind,
  GIT_HTTPS_SENTINEL,
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
