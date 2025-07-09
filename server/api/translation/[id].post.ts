import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
import { zTranslation } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'

/**
 * @route POST /api/translation/:id
 * @description Update a translation
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
  const body = await readZodBody(event, zTranslation.parse)
  const updatedTranslation = await prisma.translation.update({
    where: {
      id: nID,
    },
    data: body,
  })
  return updatedTranslation
})
