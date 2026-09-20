import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/projects/:id/i18n-keys/git-sync
 * @description Include many keys in Git sync, or keep them out of it, at once.
 *
 * One `updateMany` rather than a per-key loop: this writes a single column, so
 * there is no cross-table work to keep atomic and nothing to report per key.
 * The `where` is scoped by project, so an id from elsewhere simply does not
 * match — `updated` is the honest count either way.
 *
 * Deliberately not part of `PATCH /i18n-keys/:keyId`, which requires a draft:
 * a key that is published is exactly the one most likely to need excluding.
 */
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

  const body = await readZodBody(event, zI18nGitSyncBulk.parse)
  const { count } = await prisma.i18nKey.updateMany({
    where: { id: { in: body.keyIds }, projectId: nID },
    data: { gitSyncEnabled: body.enabled },
  })
  return { updated: count }
})
