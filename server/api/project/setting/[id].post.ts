import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
import { zProjectSetting } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const nID = numericID(id)
  const { ocrLanguage, ocrEngine } = await readZodBody(
    event,
    zProjectSetting.parse
  )
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

  const updatedSetting = await prisma.projectSettings.upsert({
    where: {
      projectID: nID,
    },
    create: {
      projectID: nID,
      ocrLanguage: ocrLanguage ?? 'eng',
      ocrEngine: ocrEngine ?? 1,
    },
    update: {
      ocrLanguage: ocrLanguage ?? 'eng',
      ocrEngine: ocrEngine ?? 1,
    },
    omit: {
      id: true,
      projectID: true,
    },
  })
  return updatedSetting
})
