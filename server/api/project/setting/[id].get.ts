import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { PROJECT_SETTINGS_OMIT } from '#server/helper/i18n'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  const settings = await prisma.projectSettings.findUnique({
    where: {
      projectID: nID,
    },
    omit: PROJECT_SETTINGS_OMIT,
  })
  return settings
})
