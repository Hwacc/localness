import prisma from '#server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '#server/helper/id'
import { requirePageTeamMember } from '#server/helper/access'
import { tagI18nInclude, shapeTag, sourceLocaleOf } from '#server/helper/i18n'

const zQuery = z.object({
  pageID: z.string(),
})

/**
 * @route GET /api/tag
 * @query pageID
 * @description Get page all tags
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const { pageID } = await getValidatedQuery(event, zQuery.parse)

  const nPageID = numericID(pageID)
  await requirePageTeamMember(event, nPageID)
  const tags = await prisma.tag.findMany({
    where: {
      pageID: nPageID,
    },
    include: {
      ...tagI18nInclude,
      // Only for the source language a key's original text is read from; every
      // tag here sits on the same page.
      page: { select: { projectID: true } },
    },
  })
  const sourceLocale = await sourceLocaleOf(tags[0]?.page?.projectID)
  return tags.map((tag) => shapeTag(tag, sourceLocale))
})
