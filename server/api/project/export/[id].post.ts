import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

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
  const project = await prisma.project.findUnique({
    where: {
      id: nID,
    },
    include: {
      pages: {
        where: {
          AND: [{ image: { not: null } }, { image: { not: '' } }],
        },
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          tags: {
            where: {
              AND: [
                { i18nKey: { not: null } },
                { i18nKey: { not: '' } },
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
