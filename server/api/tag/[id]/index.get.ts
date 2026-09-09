import { numericID } from '#server/helper/id'
import { requireTagTeamMember } from '#server/helper/access'
import { loadShapedTag } from '#server/helper/i18n'

/**
 * @route GET /api/tag/:id
 * @description Get a tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireTagTeamMember(event, nID)
  return await loadShapedTag(nID)
})
