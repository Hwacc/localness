import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { zGitSyncConflictResolve } from '#shared/utils/schemas'
import { resolveConflict } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/conflicts/:conflictId/resolve
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const conflictId = getRouterParam(event, 'conflictId')
  if (!id || !conflictId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project or conflict id',
    })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  const body = await readZodBody(event, zGitSyncConflictResolve.parse)
  return resolveConflict({
    projectId,
    conflictId: numericID(conflictId),
    action: body.action,
    text: body.text,
  })
})
