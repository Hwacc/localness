import prisma from '~/server/libs/prisma'
import { zTag } from '~/utils/schemas'
import { numericID } from '~/utils/id'
import { readZodBody } from '~/utils/validate'

/**
 * @route POST /api/tag/:id
 * @description Update a tag
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
  const body = await readZodBody(event, zTag.parse)
  const updatedTag = await prisma.tag.update({
    where: {
      id: nID,
    },
    data: body as any,
    include: {
      translation: {
        include: {
          vue: true,
          react: true,
        },
      },
    },
  })
  return updatedTag
})
