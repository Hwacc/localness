import { z } from 'zod'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { GIT_SYNC_LOG_PAGE_SIZE, GitSyncLogAction } from '#shared/constants'
import type { IGitSyncLogPage } from '#shared/types/GitSync'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(GIT_SYNC_LOG_PAGE_SIZE),
  /** Id of the last row already shown; rows older than it come next. */
  cursor: z.coerce.number().int().positive().optional(),
  action: z
    .enum([
      GitSyncLogAction.PULL_APPLY,
      GitSyncLogAction.PUSH_APPLY,
      GitSyncLogAction.CONFLICT_RESOLVE,
    ])
    .optional(),
})

/**
 * @route GET /api/projects/:id/git-sync/history
 * Cursor-paged sync history. Only summaries — no repo paths, no text.
 */
export default defineEventHandler(async (event): Promise<IGitSyncLogPage> => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  const query = await getValidatedQuery(event, querySchema.parse)
  const rows = await prisma.gitSyncLog.findMany({
    where: {
      projectId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: query.limit + 1,
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
  const page = rows.slice(0, query.limit)
  return {
    rows: page.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action as GitSyncLogAction,
      status: row.status as IGitSyncLogPage['rows'][number]['status'],
      previewId: row.previewId,
      commitSha: row.commitSha,
      detail: (row.detail ?? null) as IGitSyncLogPage['rows'][number]['detail'],
      user: row.user
        ? {
            username: row.user.username,
            nickname: row.user.nickname ?? undefined,
            avatar: row.user.avatar ?? undefined,
          }
        : null,
    })),
    nextCursor:
      rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  }
})
