import { z } from 'zod'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { applyPull } from '#server/libs/git-sync/sync'

const bodySchema = z.object({
  previewId: z.number().int().positive(),
  selectedFiles: z.array(z.string().min(1)),
  selectedKeys: z.array(z.string().min(1)),
})

/**
 * @route POST /api/projects/:id/git-sync/pull/apply
 * Applies a confirmed selection from a pending preview.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  const body = await readValidatedBody(event, bodySchema.parse)
  return applyPull({
    projectId,
    previewId: body.previewId,
    selectedFiles: body.selectedFiles,
    selectedKeys: body.selectedKeys,
  })
})
