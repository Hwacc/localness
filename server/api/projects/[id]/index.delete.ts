import { z } from 'zod'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { deleteProject } from '#server/helper/project-delete'

/**
 * @route DELETE /api/projects/:id
 * @description Permanently delete a project and everything under it (Project
 * Owner). The body must repeat the project name.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const { confirmName } = await readZodBody(
    event,
    z.object({ confirmName: z.string() }).parse
  )
  const deleted = await deleteProject(
    projectId,
    confirmName,
    event.context.ossStorage
  )
  if (!deleted) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Project name does not match',
    })
  }
  return { ok: true }
})
