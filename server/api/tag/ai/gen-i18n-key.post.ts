import type { CozeAgentI18nKeyResult } from '#shared/types'
import type { AgentErrorKind } from '#server/libs/agent/AbstractAgent'
import AgentManager from '#server/libs/agent'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import { readZodBody } from '#server/helper/validate'
import { requireTagTeamMember } from '#server/helper/access'
import { numericID } from '#server/helper/id'

/**
 * A provider refusal is not our server crashing: keep the upstream reason on
 * `message` so it survives Nitro's production sanitizing of unhandled errors.
 */
const AGENT_ERROR_STATUS: Record<AgentErrorKind, number> = {
  quota: 402,
  upstream: 502,
  config: 500,
  'bad-params': 400,
}

/**
 * @route POST /api/ai/gen-i18n-key
 * @description Generate i18n key
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const params = await readZodBody(event, zGenI18nKey.parse)
  await requireTagTeamMember(event, numericID(params.tagID))
  let result: CozeAgentI18nKeyResult | null
  try {
    result = await AgentManager.generateI18nKey<CozeAgentI18nKeyResult | null>({
      ...params,
      tagID: numericID(params.tagID),
    })
  } catch (error) {
    if (error instanceof AgentError) {
      throw createError({
        statusCode: AGENT_ERROR_STATUS[error.kind],
        statusMessage: 'Failed to generate i18n key',
        message: error.message,
        data: { kind: error.kind },
      })
    }
    throw error
  }
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
