import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { publicGitSyncBinding } from '#server/libs/git-sync/sync'

/**
 * @route GET /api/projects/:id/git-sync
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { membership } = await requireTeamMember(event, projectId)
  const row = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
  })
  const openConflicts = await prisma.gitSyncConflict.count({
    where: { projectId, status: 'open' },
  })
  return {
    role: membership.role,
    configured: Boolean(row?.token && row.product && row.remoteUrl.trim()),
    binding: row ? publicGitSyncBinding(row) : null,
    openConflicts,
  }
})
