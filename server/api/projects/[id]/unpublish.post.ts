import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/projects/:id/unpublish
 * @description Clear publishedText so selected keys return to draft
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
  const body = await readZodBody(event, zPublish.parse)
  const keyIds = body.keyIds?.filter((n) => Number.isInteger(n) && n > 0)
  if (!keyIds?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing keyIds',
    })
  }

  const owned = await prisma.i18nKey.findMany({
    where: { projectId: nID, id: { in: keyIds } },
    select: { id: true },
  })
  const ownedIds = owned.map((k) => k.id)
  if (ownedIds.length === 0) {
    return { updated: 0 }
  }
  const placeholders = ownedIds.map(() => '?').join(',')
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "LocaleValue" SET "published_text" = NULL, "updated_at" = CURRENT_TIMESTAMP WHERE "i18n_key_id" IN (${placeholders})`,
    ...ownedIds
  )
  return { updated }
})
