import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { shapeI18nKey } from '#server/helper/i18n'

/**
 * @route GET /api/translation/check
 * @description The I18nKey holding this fingerprint in the user's teams, if any
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const { fp, projectId } = getQuery<{ fp: string; projectId?: string }>(event)
  if (!fp) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing fingerprint',
    })
  }
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  })
  const teamIds = memberships.map((m) => m.teamId)
  const nProjectId = projectId ? numericID(projectId) : undefined
  const record = await prisma.i18nKey.findFirst({
    where: {
      fingerprint: fp,
      ...(nProjectId ? { projectId: nProjectId } : {}),
      project: { teamId: { in: teamIds } },
    },
    include: { locales: true, releases: { select: { releaseId: true } } },
  })
  /* The whole entry, not its id: "recover" binds the tag to what comes back. */
  return record ? shapeI18nKey(record) : null
})
