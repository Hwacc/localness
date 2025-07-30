import type { CozeAgentI18nKeyResult } from '#shared/types'
import AgentManager from '#server/libs/agent'
import { readZodBody } from '#server/helper/validate'
import { numericID } from '#server/helper/id'

/**
 * @route POST /api/ai/gen-i18n-key
 * @description Generate i18n key
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const params = await readZodBody(event, zGenI18nKey.parse)
  const result =
    await AgentManager.generateI18nKey<CozeAgentI18nKeyResult | null>({
      ...params,
      tagID: numericID(params.tagID),
    })
  if (!result) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Failed to generate i18n key',
    })
  }
  if (result.tag_id && result.i18n_key) {
    return {
      tagID: result.tag_id,
      i18nKey: result.i18n_key,
    }
  }
  return null
})
