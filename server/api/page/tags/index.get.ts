import prisma from '#server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '#server/helper/id'
import { requirePageTeamMember } from '#server/helper/access'
import { tagI18nInclude, shapeTag } from '#server/helper/i18n'

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
    include: tagI18nInclude,
  })
  return tags.map((tag) => shapeTag(tag))
})
