import {
  authenticateWriteRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { toKeyConvention } from '#server/helper/key-convention'
import prisma from '#server/libs/prisma'
import type { KeyConventionInfo } from '#shared/contract'

/**
 * @route GET /api/v1/key-convention
 * @description The project's key convention and naming prompt, for clients
 * that name keys locally. Write scope: the prompt is internal guidance, and
 * naming only matters to a client that is about to create keys.
 */
export default defineEventHandler(async (event): Promise<KeyConventionInfo> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization'),
  )
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: {
      keyPrefix: true,
      keySeparator: true,
      keyStyle: true,
      keyMaxDepth: true,
      prompt: true,
    },
  })
  await touchApiToken(token)
  return { ...toKeyConvention(settings), prompt: settings?.prompt || null }
})
