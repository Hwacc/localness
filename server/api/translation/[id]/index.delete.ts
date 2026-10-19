import { LogAction, LogStatus } from '#shared/constants/log'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireI18nKeyTeamMember } from '#server/helper/access'
import { purgeI18nKey, shapeI18nKey } from '#server/helper/i18n'
import { isI18nKeyDraft } from '#shared/utils'

/**
 * @route DELETE /api/translation/:id
 * @description Delete an I18nKey
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
  await requireI18nKeyTeamMember(event, nID)
  const existing = await prisma.i18nKey.findUnique({
    where: { id: nID },
    include: { locales: true, releases: { select: { releaseId: true } } },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Translation not found',
    })
  }
  if (!isI18nKeyDraft(existing.locales)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Only draft translations can be deleted',
    })
  }

  try {
    await prisma.$transaction((tx) => purgeI18nKey(tx, existing))

    await prisma.translationLog.create({
      data: {
        action: LogAction.DELETE,
        status: LogStatus.SUCCESS,
        userID: numericID(session.user.id),
        beforeData: existing,
        fingerprint: existing.fingerprint,
      },
    })
    return shapeI18nKey(existing)
  } catch (error) {
    console.error(error)
    await prisma.translationLog.create({
      data: {
        action: LogAction.DELETE,
        status: LogStatus.FAILED,
        beforeData: existing,
        i18nKeyId: existing.id,
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
