import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { previewPull } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/pull/preview
 * Dry run: proposes files and per-key decisions. Writes nothing.
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
  return previewPull(projectId, username)
})
