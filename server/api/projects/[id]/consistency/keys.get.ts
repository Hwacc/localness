import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { sourceLocaleOf, sourceTextOf } from '#server/helper/i18n'
import { zConsistencyKeysQuery } from '#shared/utils/schemas'

/**
 * @route GET /api/projects/:id/consistency/keys?keyIds=1,2
 * @description The members of one finding with every locale's draft and
 * published text — what the Resolve drawer plans a merge or a fix from.
 * Exact ids, never a text search, so no member can be missed.
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  requirePlus()

  const { keyIds } = await getValidatedQuery(event, zConsistencyKeysQuery.parse)
  const sourceLocale = await sourceLocaleOf(nID)
  const rows = await prisma.i18nKey.findMany({
    where: { projectId: nID, id: { in: keyIds } },
    select: {
      id: true,
      key: true,
      createdAt: true,
      _count: { select: { tags: true } },
      locales: {
        select: { locale: true, draftText: true, publishedText: true },
        orderBy: { locale: 'asc' },
      },
    },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))

  return {
    sourceLocale,
    keys: keyIds.flatMap((keyId) => {
      const row = byId.get(keyId)
      if (!row) return []
      return [
        {
          keyId: row.id,
          key: row.key,
          createdAt: row.createdAt.toISOString(),
          tagCount: row._count.tags,
          sourceText: sourceTextOf(row.locales, sourceLocale),
          locales: row.locales,
        },
      ]
    }),
  }
})
