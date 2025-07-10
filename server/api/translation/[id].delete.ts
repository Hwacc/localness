import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'

/**
 * @route DELETE /api/translation/:id
 * @description Delete a translation
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const existing = await prisma.translation.findUnique({
    where: {
      id: nID,
    },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Translation not found',
    })
  }
  try {
    const deletedTranslation = await prisma.translation.delete({
      where: {
        id: nID,
      },
    })
    await prisma.translationLog.create({
      data: {
        action: 'DELETE',
        status: 'SUCCESS',
        origin: deletedTranslation.origin,
        fingerprint: deletedTranslation.fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return deletedTranslation
  } catch (error) {
    console.error(error)
    await prisma.translationLog.create({
      data: {
        action: 'DELETE',
        status: 'ERROR',
        origin: existing.origin,
        fingerprint: existing.fingerprint,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete translation',
    })
  }
})
