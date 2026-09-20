import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { createRelease, throwReleaseHttp } from '#server/helper/release'
import { zReleaseCreate } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/releases
 * @description Define a release label.
 *
 * Project Owner, not Team Owner: deciding which releases exist is project
 * configuration, the same shelf as project settings and the Git binding. Team
 * Owner is a people-management role and does not qualify.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const { name } = await readZodBody(event, zReleaseCreate.parse)
  try {
    return await createRelease({ projectId, name })
  } catch (error) {
    throwReleaseHttp(error)
  }
})