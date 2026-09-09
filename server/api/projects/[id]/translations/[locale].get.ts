import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/translations/:locale
 * @query version=draft|published
 * @description Flat JSON map of i18n key -> text
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const locale = getRouterParam(event, 'locale')
  if (!id || !locale) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id or locale',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  const query = getQuery(event)
  const version = query.version === 'published' ? 'published' : 'draft'

  const keys = await prisma.i18nKey.findMany({
    where: { projectId: nID },
    include: {
      locales: {
        where: { locale },
      },
    },
  })

  const map: Record<string, string> = {}
  for (const key of keys) {
    const row = key.locales[0]
    const text =
      version === 'published' ? row?.publishedText : row?.draftText
    if (text != null && text !== '') {
      map[key.key] = text
    }
  }
  return map
})
