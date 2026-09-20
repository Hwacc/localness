import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { shapeI18nKeyRow } from '#server/helper/i18n'

/**
 * @route POST /api/projects/:id/i18n-keys/:keyId/git-sync
 * @description Include this key in Git sync, or keep it out of it.
 *
 * Deliberately not part of `PATCH /i18n-keys/:keyId`, which runs
 * `assertI18nKeyWritable` and so refuses anything published. This is a sync
 * setting rather than content, and the keys that most need switching off are
 * exactly the published ones.
 *
 * Team member, not Project Owner: it is the same weight as editing the key.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const keyId = getRouterParam(event, 'keyId')
  if (!id || !keyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const nKeyId = numericID(keyId)
  await requireTeamMember(event, nID)

  const existing = await prisma.i18nKey.findFirst({
    where: { id: nKeyId, projectId: nID },
    select: { id: true },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Translation not found',
    })
  }

  const body = await readZodBody(event, zI18nGitSyncToggle.parse)
  const updated = await prisma.i18nKey.update({
    where: { id: nKeyId },
    data: { gitSyncEnabled: body.enabled },
    include: {
      locales: true,
      _count: { select: { tags: true } },
    },
  })

  return shapeI18nKeyRow(updated)
})
