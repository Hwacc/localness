import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { readZodBody } from '~/utils/validate'
import { zID, zPageSetting } from '~/utils/schemas'
import { numericID } from '~/utils/id'

const zPage = z.object(
  {
    projectID: zID,
    name: z.string().min(3),
    image: z.string().nonempty(), // image key
    settings: zPageSetting,
  },
  'Page parameters validate failed'
)
/**
 * @route POST /api/page
 * @description Create a new page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { projectID, name, image, settings } = await readZodBody(
    event,
    zPage.parse
  )
  if (!projectID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing projectID',
    })
  }
  const nProjectID = numericID(projectID)

  const belongProject = await prisma.project.findUnique({
    where: {
      id: nProjectID,
    },
    include: {
      settings: true,
    },
  })
  if (!belongProject) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Project not found',
    })
  }

  const createdPage = await prisma.page.create({
    data: {
      name,
      image,
      projectID: nProjectID,
    },
    include: {
      tags: true,
    },
  })

  await prisma.pageSettings.create({
    data: {
      pageID: createdPage.id,
      ocrLanguage:
        settings?.ocrLanguage ?? belongProject.settings?.ocrLanguage ?? 'eng',
      ocrEngine: settings?.ocrEngine ?? belongProject.settings?.ocrEngine ?? 1,
    },
  })

  return await prisma.page.findUnique({
    where: {
      id: createdPage.id,
    },
    include: {
      tags: true,
      settings: {
        omit: {
          id: true,
          pageID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
})
