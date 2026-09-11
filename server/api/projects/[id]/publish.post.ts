import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'

/**
 * Restricts the update to rows that would actually change. SQLite's `changes()`
 * counts every row the statement touched, including ones already equal, so
 * without this the reported count is just "locale rows matched" and reads as
 * work done when nothing was published. It also keeps `updated_at` from moving
 * on untouched rows.
 */
const CHANGED_ONLY = `COALESCE("published_text", '') != COALESCE("draft_text", '')`

/**
 * @route POST /api/projects/:id/publish
 * @description Copy draftText to publishedText for selected or all keys
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
  const locales = body.locales?.filter((s) => s.trim().length > 0)
  const rows = body.rows

  // Exact pairs take precedence: a caller holding a mixed set of key+locale
  // results must not have it widened into a cross product.
  if (rows?.length) {
    const owned = await prisma.i18nKey.findMany({
      where: { projectId: nID, key: { in: rows.map((r) => r.key) } },
      select: { id: true, key: true },
    })
    const idByKey = new Map(owned.map((k) => [k.key, k.id]))
    const pairs = rows
      .map((r) => ({ id: idByKey.get(r.key), locale: r.locale }))
      .filter((p): p is { id: number; locale: string } => p.id != null)
    if (!pairs.length) {
      return { updated: 0 }
    }
    const clause = pairs
      .map(() => '("i18n_key_id" = ? AND "locale" = ?)')
      .join(' OR ')
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "LocaleValue" SET "published_text" = "draft_text", "updated_at" = CURRENT_TIMESTAMP WHERE (${clause}) AND ${CHANGED_ONLY}`,
      ...pairs.flatMap((p) => [p.id, p.locale])
    )
    return { updated }
  }

  // Scoping clause: without it a caller that only touched `ja` would also
  // publish every other locale's draft on the same key.
  const localeClause = locales?.length
    ? ` AND "locale" IN (${locales.map(() => '?').join(',')})`
    : ''
  const localeArgs = locales?.length ? locales : []

  let updated: number
  if (keyIds && keyIds.length > 0) {
    const owned = await prisma.i18nKey.findMany({
      where: { projectId: nID, id: { in: keyIds } },
      select: { id: true },
    })
    const ownedIds = owned.map((k) => k.id)
    if (ownedIds.length === 0) {
      return { updated: 0 }
    }
    const placeholders = ownedIds.map(() => '?').join(',')
    updated = await prisma.$executeRawUnsafe(
      `UPDATE "LocaleValue" SET "published_text" = "draft_text", "updated_at" = CURRENT_TIMESTAMP WHERE "i18n_key_id" IN (${placeholders})${localeClause} AND ${CHANGED_ONLY}`,
      ...ownedIds,
      ...localeArgs
    )
  } else {
    updated = await prisma.$executeRawUnsafe(
      `UPDATE "LocaleValue" SET "published_text" = "draft_text", "updated_at" = CURRENT_TIMESTAMP WHERE "i18n_key_id" IN (SELECT "id" FROM "I18nKey" WHERE "project_id" = ?)${localeClause} AND ${CHANGED_ONLY}`,
      nID,
      ...localeArgs
    )
  }

  return { updated }
})
