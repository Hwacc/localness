import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '~/utils/id'
import { readZodBody } from '~/utils/validate'
import { zProjectSetting } from '~/utils/schemas'

const zProject = z.object(
  {
    name: z.string().min(3),
    description: z.optional(z.string()),
    settings: zProjectSetting,
  },
  'Project parameters validate failed'
)
/**
 * @route POST /api/project/:id
 * @description Update a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const { name, description, settings } = await readZodBody(
    event,
    zProject.parse
  )
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }
  const findProject = await prisma.project.findUnique({
    where: {
      id: nID,
    },
  })

  if (!findProject || session.user.id !== findProject.ownerID) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }

  // update setting
  await prisma.projectSettings.update({
    where: {
      projectID: nID,
    },
    data: {
      ocrLanguage: settings?.ocrLanguage ?? 'eng',
      ocrEngine: settings?.ocrEngine ?? 1,
    },
  })

  // update project
  const updatedProject = await prisma.project.update({
    where: {
      id: nID,
    },
    data: {
      name,
      description,
    },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      settings: {
        omit: {
          id: true,
          projectID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  return updatedProject
})
