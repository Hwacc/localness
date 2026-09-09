import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
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
  const { ocrLanguage, ocrEngine } = await readZodBody(
    event,
    zProjectSetting.parse
  )

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
    omit: PROJECT_SETTINGS_OMIT,
  })
  return updatedSetting
})
