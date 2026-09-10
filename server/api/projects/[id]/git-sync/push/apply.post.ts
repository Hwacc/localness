import { z } from 'zod'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { applyPush } from '#server/libs/git-sync/sync'

const bodySchema = z.object({
  previewId: z.number().int().positive(),
  selectedKeys: z.array(z.string().min(1)).min(1),
})

/**
 * @route POST /api/projects/:id/git-sync/push/apply
 * Commits a confirmed selection as a new source batch.
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
  const body = await readValidatedBody(event, bodySchema.parse)
  return applyPush({
    projectId,
    previewId: body.previewId,
    selectedKeys: body.selectedKeys,
    triggeredBy: username,
  })
})
