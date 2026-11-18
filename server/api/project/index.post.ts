import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requireTeamMembership } from '#server/helper/access'
import {
  assertSourceLocale,
  projectDetailInclude,
  shapeProject,
} from '#server/helper/i18n'
import { DEFAULT_LOCALES, DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import {
  DEFAULT_KEY_CONVENTION,
  slugKeyPrefix,
} from '#shared/utils/key-convention'

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

  // A new project starts on the default locale set, so that is the list the
  // source language has to come from.
  if (settings?.localeFallback) {
    assertSourceLocale(settings.localeFallback, [...DEFAULT_LOCALES])
  }

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
        localeFallback: settings?.localeFallback ?? DEFAULT_LOCALE_FALLBACK,
        // The slug is only a starting point. `Project.name` is free text that
        // need not be latin, and the value is stored as a snapshot, so renaming
        // the project later does not move the keys it already produced. An
        // explicitly sent prefix wins, including an empty one.
        keyPrefix: settings?.keyPrefix ?? slugKeyPrefix(name),
        keySeparator:
          settings?.keySeparator ?? DEFAULT_KEY_CONVENTION.separator,
        keyStyle: settings?.keyStyle ?? DEFAULT_KEY_CONVENTION.style,
        keyMaxDepth: settings?.keyMaxDepth ?? DEFAULT_KEY_CONVENTION.maxDepth,
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
