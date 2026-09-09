import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route GET /api/translation/check
 * @description Check if an I18nKey exists by fingerprint in the user's teams
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
    select: { id: true },
  })
  return record ? record.id : null
})
