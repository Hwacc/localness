import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { transferKeys, throwTransferHttp } from '#server/helper/i18n-transfer'
import { zI18nTransfer } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/i18n-keys/transfer
 * @description Copy or move translations into another Project, carrying every
 * LocaleValue and nothing else — no Tags, no Release labels, no Git base.
 *
 * The project in the path is the source; the target rides in the body. Both
 * sides go through `requireTeamMember`, so a Team member is enough and an Admin
 * who is not on the target's Team is refused like anyone else. No existing
 * helper authorizes two projects at once, hence the two calls.
 *
 * A batch may partly succeed: a key the target already has is skipped, and one
 * whose write throws is reported, both without stopping the rest. That is why
 * per-key failures come back as a 200 describing the outcome rather than a 500.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const sourceProjectId = numericID(id)
  await requireTeamMember(event, sourceProjectId)
  const body = await readZodBody(event, zI18nTransfer.parse)
  await requireTeamMember(event, body.targetProjectId)
  try {
    return await transferKeys({ sourceProjectId, ...body })
  } catch (error) {
    throwTransferHttp(error)
  }
})
