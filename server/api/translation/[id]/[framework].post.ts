import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { LogAction, LogStatus } from '~~/shared/constants/log'
import { requireI18nKeyTeamMember } from '#server/helper/access'
import {
  localesToContent,
  sourceLocaleOf,
  upsertLocaleDrafts,
  writeOriginToSourceLocale,
  assertI18nKeyWritable,
} from '#server/helper/i18n'

/**
 * @route POST /api/translation/:id/:framework
 * @description Update locale drafts (vue/react write the same LocaleValue set)
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!event.context.params) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing params',
    })
  }
  const { id, framework } = event.context.params
  if (!id || !framework) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id or framework',
    })
  }
  if (framework !== 'vue' && framework !== 'react') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid framework',
    })
  }

  const nID = numericID(id)
  await requireI18nKeyTeamMember(event, nID)
  const body = await readZodBody(event, zTranslationContent.parse)
  const safeBody = omit(body, ['id', 'translationID', 'createdAt', 'updatedAt'])

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

  const before = localesToContent(existing.locales)
  try {
    /*
     * The source language's row is the key's original text, not just another
     * locale: writing it rewrites `origin` (and its fingerprint), and clearing it
     * is ignored — an original text cannot be blank. It is dropped from the locale
     * map and written through the origin helper, so that row has one writer.
     */
    const raw = safeBody as Record<string, string | null | undefined>
    const sourceLocale = await sourceLocaleOf(existing.projectId)
    const sourceText =
      raw[sourceLocale] === undefined ? undefined : String(raw[sourceLocale])
    await upsertLocaleDrafts(nID, omit(raw, sourceLocale))
    if (sourceText?.trim()) {
      await writeOriginToSourceLocale({
        projectId: existing.projectId,
        i18nKeyId: nID,
        origin: sourceText,
        sourceLocale,
      })
    }
    const loaded = await prisma.i18nKey.findUnique({
      where: { id: nID },
      include: { locales: true },
    })
    const after = localesToContent(loaded?.locales)
    await prisma.translationLog.create({
      data: {
        action: existing.locales.length ? LogAction.UPDATE : LogAction.CREATE,
        status: LogStatus.SUCCESS,
        beforeData: before,
        afterData: after,
        i18nKeyId: nID,
        userID: numericID(session.user.id),
      },
    })
    return after
  } catch (error) {
    console.log(error)
    await prisma.translationLog.create({
      data: {
        action: existing.locales.length ? LogAction.UPDATE : LogAction.CREATE,
        status: LogStatus.FAILED,
        beforeData: before,
        i18nKeyId: nID,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 500,
      message: 'Fail to upsert translations',
    })
  }
})
