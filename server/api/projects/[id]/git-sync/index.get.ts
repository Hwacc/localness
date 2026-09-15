import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { publicGitSyncBinding } from '#server/libs/git-sync/sync'
import { isProjectSteward } from '#server/helper/project-owner'

/**
 * @route GET /api/projects/:id/git-sync
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { membership, userId } = await requireTeamMember(event, projectId)
  const row = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
  })
  const ownerRow = await prisma.projectOwner.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { userId: true },
  })
  const isSteward = isProjectSteward({
    userId,
    ownerUserIds: ownerRow ? [ownerRow.userId] : [],
  })
  const openConflicts = await prisma.gitSyncConflict.count({
    where: { projectId, status: 'open' },
  })
  return {
    role: membership.role,
    isSteward,
    configured: Boolean(row?.token && row.product && row.remoteUrl.trim()),
    binding: row ? publicGitSyncBinding(row) : null,
    openConflicts,
  }
})
