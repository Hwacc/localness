import type { AgentErrorKind } from '#server/libs/agent/AbstractAgent'
import AgentManager from '#server/libs/agent'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requireTagTeamMember } from '#server/helper/access'
import { numericID } from '#server/helper/id'
import { toKeyConvention } from '#server/helper/key-convention'

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
 * @route POST /api/tag/ai/gen-i18n-key
 * @description Generate i18n key
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const params = await readZodBody(event, zGenI18nKey.parse)
  const { tag } = await requireTagTeamMember(event, numericID(params.tagID))
  // Read here rather than taken from the body: the same convention has to reach
  // both the model and the validator, and a caller must not be able to pick it.
  // `requireTagTeamMember` has already 404'd a tag without a page; the guard is
  // only there because the relation is typed nullable.
  const projectID = tag.page?.projectID
  const settings = projectID
    ? await prisma.projectSettings.findUnique({
        where: { projectID },
        select: {
          keyPrefix: true,
          keySeparator: true,
          keyStyle: true,
          keyMaxDepth: true,
        },
      })
    : null
  try {
    const result = await AgentManager.generateI18nKey({
      ...params,
      tagID: numericID(params.tagID),
      convention: toKeyConvention(settings),
    })
    return {
      tagID: result.tag_id,
      source: result.source,
      key: result.key,
      confidence: result.confidence,
      alternatives: result.alternatives,
      reason: result.reason,
      violations: result.violations,
    }
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
})
