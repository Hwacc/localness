import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requireTeamMember } from '#server/helper/access'
import { PROJECT_SETTINGS_OMIT } from '#server/helper/i18n'

/**
 * @route POST /api/project/:id
 * @description Update a project
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
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  await requireTeamMember(event, nID)

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

  if (settings) {
    await prisma.projectSettings.upsert({
      where: {
        projectID: nID,
      },
      create: {
        projectID: nID,
        ocrLanguage: settings?.ocrLanguage ?? 'eng',
        ocrEngine: settings?.ocrEngine ?? 1,
        prompt: settings?.prompt ?? '',
      },
      update: settings,
    })
  }

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
      teamId: true,
      settings: {
        omit: PROJECT_SETTINGS_OMIT,
      },
    },
  })

  return updatedProject
})
