import { createError } from 'h3'
import type { GitSyncErrorCode } from '#shared/constants'

export function gitSyncError(
  statusCode: number,
  code: GitSyncErrorCode,
  statusMessage: string
) {
  return createError({ statusCode, statusMessage, data: { code } })
}

/** The `data.code` of an error thrown by `gitSyncError`, else null. */
export function gitSyncErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) return null
  const data = (error as { data?: unknown }).data
  if (!data || typeof data !== 'object' || !('code' in data)) return null
  return String((data as { code: unknown }).code)
}
