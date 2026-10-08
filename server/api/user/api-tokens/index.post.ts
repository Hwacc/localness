import prisma from '#server/libs/prisma'
import { requireSessionActor } from '#server/helper/access'
import {
  apiTokenName,
  apiTokenPrefix,
  apiTokenScope,
  generateApiToken,
  hashApiToken,
} from '#server/helper/api-token'
import {
  apiTokenProjectIds,
  isUserOnProjectTeam,
} from '#server/helper/api-token-project'

/**
 * @route POST /api/user/api-tokens
 * @description Mint a personal token that reaches the projects you name.
 *
 * Any member may mint one, and may only name projects they are currently on the
 * team of — a token cannot grant reach its owner does not have. That is checked
 * here, at creation, *and* again on every request: creation is a snapshot, the
 * request-time check is what makes the credential die with the membership.
 *
 * Listing a project the caller is not a member of is a 403 rather than a 404, so
 * the response cannot be used to probe which project ids exist.
 *
 * The plaintext is returned only here; no read path ever returns it.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionActor(event)
  const body = await readBody(event)

  const name = apiTokenName(body?.name)
  const scope = apiTokenScope(body?.scope)
  const projectIds = apiTokenProjectIds(body?.projects)

  for (const projectId of projectIds) {
    if (!(await isUserOnProjectTeam(userId, projectId))) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You are not a member of every project you picked',
      })
    }
  }

  const plaintext = generateApiToken()
  const created = await prisma.apiToken.create({
    data: {
      createdBy: userId,
      name,
      scope,
      tokenHash: hashApiToken(plaintext),
      prefix: apiTokenPrefix(plaintext),
      // Nested write, so the token and its set land together or not at all.
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      scope: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  })

  return { token: plaintext, ...created, projects: projectIds }
})