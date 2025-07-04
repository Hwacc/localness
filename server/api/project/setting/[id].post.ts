import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
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

  const updatedSetting = await prisma.projectSettings.update({
    where: {
      projectID: nID,
    },
    data: {
      ocrLanguage,
      ocrEngine,
    },
    omit: {
      id: true,
      projectID: true,
    },
  })
  return updatedSetting
})
