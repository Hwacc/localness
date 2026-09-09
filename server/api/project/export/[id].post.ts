import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { shapeTag } from '#server/helper/i18n'

/**
 * @route POST /api/project/export/:id
 * @description Export a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)

  const body = await readValidatedBody(event, zExport.parse)

  const inPages = body.pages.map((pageID) => numericID(pageID))
  const inEmptyI18nKey = body.i18nKey
  const startUpdatedAt = body.dateRange?.start
  const endUpdatedAt = body.dateRange?.end

  const project = await prisma.project.findUnique({
    where: {
      id: nID,
    },
    include: {
      pages: {
        where: {
          AND: [
            { id: { in: inPages } },
            { image: { not: null } },
            { image: { not: '' } },
          ],
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          tags: {
            where: {
              AND: [
                { i18nKey: inEmptyI18nKey ? undefined : { not: null } },
                { i18nKey: inEmptyI18nKey ? undefined : { not: '' } },
                { updatedAt: { gte: startUpdatedAt } },
                { updatedAt: { lte: endUpdatedAt } },
                {
                  i18nKeyId: { not: null },
                },
              ],
            },
            include: {
              i18nKeyRecord: {
                where: {
                  AND: [
                    { origin: { not: undefined } },
                    { origin: { not: '' } },
                  ],
                },
                include: { locales: true },
              },
            },
          },
        },
      },
    },
  })
  if (!project) return null
  return {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      tags: page.tags.flatMap((tag) => {
        const locales = tag.i18nKeyRecord?.locales ?? []
        const hasPublished = locales.some(
          (locale) => (locale.publishedText ?? '') !== ''
        )
        if (!hasPublished) return []
        return [shapeTag(tag, 'published')]
      }),
    })),
  }
})
