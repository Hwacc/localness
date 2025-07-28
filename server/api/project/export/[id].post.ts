import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'

/**
 * @route POST /api/project/export/:id
 * @description Export a project
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)

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
                  translationID: { not: null },
                },
              ],
            },
            include: {
              translation: {
                where: {
                  AND: [
                    { origin: { not: undefined } },
                    { origin: { not: '' } },
                  ],
                },
                include: {
                  vue: true,
                  react: true,
                },
              },
            },
          },
        },
      },
    },
  })
  return project
})
