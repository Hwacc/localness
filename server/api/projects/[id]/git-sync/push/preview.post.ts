import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { previewPush } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/push/preview
 * Dry run: pure database work, no clone. Returns every source key with the
 * reason it is or is not proposed.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { session } = await requireTeamMember(event, projectId)
  const username =
    typeof session.user.username === 'string'
      ? session.user.username
      : 'unknown'
  return previewPush(projectId, username)
})
