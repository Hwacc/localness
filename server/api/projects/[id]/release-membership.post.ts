import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { setReleaseMembership, throwReleaseHttp } from '#server/helper/release'
import { zReleaseMembership } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/release-membership
 * @description Add or remove one release label across many pages / translations.
 *
 * Team member: attaching a label to content is content work, like editing the
 * content itself. Only *defining* which releases exist is Project Owner config.
 *
 * Both modes are set operations, so re-adding is a no-op — the translations page
 * batch action does not have to know what is already labelled.
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
  await requireTeamMember(event, projectId)
  const body = await readZodBody(event, zReleaseMembership.parse)
  try {
    return await setReleaseMembership({ projectId, ...body })
  } catch (error) {
    throwReleaseHttp(error)
  }
})