import prisma from '#server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'

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
  if (settings) {
    await prisma.projectSettings.upsert({
      where: {
        projectID: nID,
      },
      create: {
        projectID: nID,
        ocrLanguage: settings?.ocrLanguage ?? 'eng',
        ocrEngine: settings?.ocrEngine ?? 1,
      },
      update: settings,
    })
  }
  
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
