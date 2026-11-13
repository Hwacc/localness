import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { zGitSyncConflictResolveBulk } from '#shared/schemas'
import { resolveConflicts } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/conflicts/resolve
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { userId } = await requireTeamMember(event, projectId)
  const body = await readZodBody(event, zGitSyncConflictResolveBulk.parse)
  return resolveConflicts({
    projectId,
    conflictIds: body.ids,
    action: body.action,
    userId,
  })
})
