import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/api-tokens
 * @description This project's API tokens, newest first. Hashes never leave here.
 *
 * A member sees only what they minted; a steward sees the whole roster. That is
 * what makes revoking someone else's credential a deliberate act rather than a
 * guess at a name.
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
      projectId,
      ...(access.isSteward ? {} : { createdBy: access.userId }),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
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
