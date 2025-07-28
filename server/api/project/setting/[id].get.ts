import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const nID = numericID(id)
  const settings = await prisma.projectSettings.findUnique({
    where: {
      projectID: nID,
    },
    omit: {
      id: true,
      projectID: true,
    },
  })
  return settings
})
