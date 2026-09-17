import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import { shapeProjectSkill } from '#server/helper/project-skill'

/**
 * @route GET /api/projects/:id/skills
 * @description Shared Skill packages for this project. Every member sees the
 * whole list — that is the point of the page. Email is never included.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireProjectAccess(event, projectId)

  const raw = getQuery(event).q
  const q = typeof raw === 'string' ? raw.trim() : ''

  const rows = await prisma.projectSkill.findMany({
    where: {
      projectId,
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      originalName: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { username: true, nickname: true } },
    },
  })

  return rows.map(shapeProjectSkill)
})
