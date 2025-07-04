import prisma from '~/server/libs/prisma'
import z from 'zod/v4'
import { readZodBody } from '~/utils/validate'
import { zProjectSetting } from '~/utils/schemas'

const zProject = z.object({
  name: z.string().min(3),
  description: z.optional(z.string()),
  settings: zProjectSetting,
}, 'Project parameters validate failed')

/**
 * @route POST /api/project
 * @description Create a new project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { name, description, settings } = await readZodBody(event, zProject.parse)

  const createdProject = await prisma.project.create({
    data: {
      name,
      description,
      ownerID: session.user.id as number,
      ownerUsername: session.user.username,
    }
  })

  await prisma.projectSettings.create({
    data: {
      projectID: createdProject.id,
      ocrLanguage: settings?.ocrLanguage ?? 'eng',
      ocrEngine: settings?.ocrEngine ?? 1,
    },
    omit: {
      id: true,
      projectID: true,
    },
  })

  return await prisma.project.findUnique({
    where: {
      id: createdProject.id,
    },
    include: {
      users: true,
      pages: true,
      settings: {
        omit: {
          id: true,
          projectID: true,
          createdAt: true,
          updatedAt: true,
        }
      }
    },
  })
})
