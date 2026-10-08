import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/api-tokens
 * @description Which credentials can reach this project — a read-only audit.
 *
 * Tokens are personal now and are managed at `/api/user/api-tokens`; this is the
 * other direction of the same fact, and it belongs to the project. It answers
 * "who has a way into my project", which a steward has to be able to ask.
 *
 * It shows **only this project's slice** of each token. A token that also reaches
 * three other projects is reported here as reaching this one — the rest is not
 * this project's business, and leaking it would turn an audit view into a map of
 * someone else's access.
 *
 * A member sees the ones they minted; a steward sees everything reaching the
 * project. Hashes never leave here.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const access = await requireProjectAccess(event, projectId)

  const rows = await prisma.apiToken.findMany({
    where: {
      projects: { some: { projectId } },
      ...(access.isSteward ? {} : { createdBy: access.userId }),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scope: true,
      createdBy: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { username: true, nickname: true } },
    },
  })

  // Only the display name; email is matched against, never handed back.
  return rows.map(({ user, ...row }) => ({
    ...row,
    creatorName: user.nickname || user.username,
  }))
})