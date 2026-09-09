import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { projectDetailInclude, shapeProject } from '#server/helper/i18n'

/**
 * @route GET /api/project/:id
 * @description Get a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  const project = await prisma.project.findUnique({
    where: {
      id: nID,
    },
    include: {
      ...projectDetailInclude,
      pages: {
        orderBy: {
          updatedAt: 'desc' as const,
        },
      },
    },
  })
  return project ? shapeProject(project) : null
})
