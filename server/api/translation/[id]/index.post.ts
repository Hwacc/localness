import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { LogAction, LogStatus } from '#shared/constants/log'

/**
 * @route POST /api/translation/:id
 * @description Update a translation
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
  const body = await readZodBody(event, zTranslation.parse)
  if (!body.origin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing origin text',
    })
  }
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
  // generate new fingerprint
  try {
    const safeData = omit(body, ['id', 'fingerprint', 'vue', 'react'])
    const updatedTranslation = await prisma.translation.update({
      where: {
        id: nID,
      },
      data: safeData,
    })
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        beforeData: existing,
        afterData: updatedTranslation,
        translationID: updatedTranslation.id,
        fingerprint: updatedTranslation.fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return updatedTranslation
  } catch (error) {
    console.error(error)
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.FAILED,
        beforeData: existing,
        translationID: existing.id,
        fingerprint: existing.fingerprint,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update translation',
    })
  }
})
