import type { AgentErrorKind } from '#server/libs/agent/AbstractAgent'
import AgentManager from '#server/libs/agent'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requireTagTeamMember } from '#server/helper/access'
import { numericID } from '#server/helper/id'
import { resolveKeyConvention, shapeKeyDuplicates } from '#server/helper/key-convention'

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
  // Both levels are fetched because a page inherits the project's convention
  // until it sets its own. `requireTagTeamMember` has already 404'd a tag
  // without a page; the guards are only there because the relation is typed
  // nullable.
  const projectID = tag.page?.projectID
  const pageID = tag.page?.id
  const conventionColumns = {
    keyPrefix: true,
    keySeparator: true,
    keyStyle: true,
    keyMaxDepth: true,
  } as const
  const [pageSettings, projectSettings] = await Promise.all([
    pageID
      ? prisma.pageSettings.findUnique({
          where: { pageID },
          select: conventionColumns,
        })
      : null,
    projectID
      ? prisma.projectSettings.findUnique({
          where: { projectID },
          select: conventionColumns,
        })
      : null,
  ])
  try {
    const result = await AgentManager.generateI18nKey({
      ...params,
      tagID: numericID(params.tagID),
      convention: resolveKeyConvention(pageSettings, projectSettings),
    })
    // Whether the key is already in the project is a fact about the project,
    // not about the convention, so the agent does not know it and the answer is
    // checked here — over every candidate, not just the primary.
    const candidates = [
      result.key,
      ...(result.alternatives ?? []).map((one) => one.key),
    ].filter((key) => key !== '')
    const existing =
      projectID && candidates.length
        ? await prisma.i18nKey.findMany({
            where: { projectId: projectID, key: { in: candidates } },
            select: { key: true, origin: true },
          })
        : []
    const { tag_id, ...suggestion } = result
    return {
      tagID: tag_id,
      ...suggestion,
      duplicates: shapeKeyDuplicates(existing, params.tagOrigin),
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
