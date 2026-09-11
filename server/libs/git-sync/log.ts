import prisma from '#server/libs/prisma'
import type {
  GitSyncLogAction,
  GitSyncLogStatus,
  GitSyncPushReason,
} from '#shared/constants'
import type { IGitSyncLogDetail } from '#shared/types/GitSync'

/** Narrow view of the Prisma client so this works inside `$transaction`. */
export type GitSyncLogDb = Pick<typeof prisma, 'gitSyncLog'>

/**
 * Append one history row. Previews are never logged — only runs that landed
 * something, or an apply that refused to.
 */
export async function writeGitSyncLog(
  params: {
    projectId: number
    action: GitSyncLogAction
    status: GitSyncLogStatus
    previewId?: number | null
    commitSha?: string
    detail: IGitSyncLogDetail
    userId?: number | null
  },
  db: GitSyncLogDb = prisma
) {
  await db.gitSyncLog.create({
    data: {
      projectId: params.projectId,
      action: params.action,
      status: params.status,
      previewId: params.previewId ?? null,
      commitSha: params.commitSha ?? '',
      detail: params.detail as object,
      userID: params.userId ?? null,
    },
  })
}

/** Collapse per-key skip reasons into `{ reason: count }` for the log detail. */
export function countSkipReasons(
  skipped: { key: string; reason: GitSyncPushReason }[]
): Partial<Record<GitSyncPushReason, number>> {
  const out: Partial<Record<GitSyncPushReason, number>> = {}
  for (const row of skipped) {
    out[row.reason] = (out[row.reason] ?? 0) + 1
  }
  return out
}
