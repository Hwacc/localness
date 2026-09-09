import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { LogAction, LogStatus } from '#shared/constants/log'
import { requireI18nKeyTeamMember } from '#server/helper/access'
import { shapeI18nKey, upsertLocaleDrafts, assertI18nKeyWritable } from '#server/helper/i18n'
import { fpTranslation } from '#shared/utils'

/**
 * @route POST /api/translation/:id
 * @description Update an I18nKey origin
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
  const body = await readZodBody(event, zTranslation.parse)
  if (!body.origin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing origin text',
    })
  }
  const existing = await prisma.i18nKey.findUnique({
    where: { id: nID },
    include: { locales: true },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Translation not found',
    })
  }
  assertI18nKeyWritable(existing.locales)
  try {
    const safeData = omit(body, [
      'id',
      'fingerprint',
      'vue',
      'react',
      'projectId',
      'key',
      'force',
    ])
    const origin = safeData.origin as string
    const updated = await prisma.i18nKey.update({
      where: { id: nID },
      data: {
        origin,
        fingerprint: fpTranslation(origin),
      },
      include: { locales: true },
    })
    const content = body.vue || body.react
    if (content) {
      await upsertLocaleDrafts(
        nID,
        content as Record<string, string | null | undefined>
      )
    }
    const loaded = await prisma.i18nKey.findUnique({
      where: { id: nID },
      include: { locales: true },
    })
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        beforeData: existing,
        afterData: loaded,
        i18nKeyId: nID,
        fingerprint: updated.fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return loaded ? shapeI18nKey(loaded) : null
  } catch (error) {
    console.error(error)
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.FAILED,
        beforeData: existing,
        i18nKeyId: existing.id,
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
