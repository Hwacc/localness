import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/api-tokens
 * @description This project's API tokens, newest first. Hashes never leave here.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)

  const rows = await prisma.apiToken.findMany({
    where: { projectId },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  })
  return rows
})