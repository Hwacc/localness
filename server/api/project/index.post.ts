import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requireTeamOwner } from '#server/helper/access'
import { projectDetailInclude, shapeProject } from '#server/helper/i18n'
import { DEFAULT_LOCALES, DEFAULT_LOCALE_FALLBACK } from '#shared/constants'

/**
 * @route POST /api/project
 * @description Create a project (Team OWNER)
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const { name, description, settings, teamId } = await readZodBody(
    event,
    zProject.parse
  )
  if (!teamId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing teamId',
    })
  }
  await requireTeamOwner(event, teamId)

  const createdProject = await prisma.project.create({
    data: {
      name,
      description,
      teamId,
    },
  })

  await prisma.projectSettings.create({
    data: {
      projectID: createdProject.id,
      ocrLanguage: settings?.ocrLanguage ?? 'eng',
      ocrEngine: settings?.ocrEngine ?? 1,
      prompt: settings?.prompt ?? '',
      locales: [...DEFAULT_LOCALES],
      localeFallback: DEFAULT_LOCALE_FALLBACK,
    },
  })

  const project = await prisma.project.findUnique({
    where: {
      id: createdProject.id,
    },
    include: projectDetailInclude,
  })
  return project ? shapeProject(project) : null
})
