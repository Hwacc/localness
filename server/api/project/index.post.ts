import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requireTeamMembership } from '#server/helper/access'
import { projectDetailInclude, shapeProject } from '#server/helper/i18n'
import { DEFAULT_LOCALES, DEFAULT_LOCALE_FALLBACK } from '#shared/constants'

/**
 * @route POST /api/project
 * @description Create a project (any Team Member). Creator becomes Project Owner.
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
  const { userId } = await requireTeamMembership(event, teamId)

  const createdProject = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name,
        description,
        teamId,
      },
    })
    await tx.projectSettings.create({
      data: {
        projectID: created.id,
        ocrLanguage: settings?.ocrLanguage ?? 'eng',
        ocrEngine: settings?.ocrEngine ?? 1,
        prompt: settings?.prompt ?? '',
        locales: [...DEFAULT_LOCALES],
        localeFallback: DEFAULT_LOCALE_FALLBACK,
      },
    })
    await tx.projectOwner.create({
      data: {
        userId,
        projectId: created.id,
      },
    })
    return created
  })

  const project = await prisma.project.findUnique({
    where: {
      id: createdProject.id,
    },
    include: projectDetailInclude,
  })
  return project ? shapeProject(project, userId) : null
})
