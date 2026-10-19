import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { readZodBody } from '#server/helper/validate'
import { localesToContent, sourceLocaleOf } from '#server/helper/i18n'
import { LogAction, LogStatus } from '#shared/constants/log'
import { fpTranslation } from '#shared/utils'
import { zConsistencyFix } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/consistency/fix
 * @description Save & publish one locale of one key from the Resolve drawer.
 * Mismatch and lint rules read published text, so a draft-only edit would
 * leave the finding in place; writing both columns makes the fix visible on
 * the next scan. Other locales are untouched. Editing the source locale
 * re-fingerprints the key, exactly like the translation editor does.
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  const { userId } = await requireTeamMember(event, nID)
  requirePlus()

  const body = await readZodBody(event, zConsistencyFix.parse)
  const existing = await prisma.i18nKey.findFirst({
    where: { id: body.keyId, projectId: nID },
    include: { locales: true },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Translation not found' })
  }

  const sourceLocale = await sourceLocaleOf(nID)
  const isSource = body.locale === sourceLocale
  const fingerprint = isSource ? fpTranslation(body.text) : existing.fingerprint

  const after = await prisma.$transaction(async (tx) => {
    if (isSource && fingerprint !== existing.fingerprint) {
      await tx.i18nKey.update({
        where: { id: existing.id },
        data: { fingerprint },
      })
    }
    const stamp = isSource ? {} : { sourceFingerprint: fingerprint }
    await tx.localeValue.upsert({
      where: {
        i18nKeyId_locale: { i18nKeyId: existing.id, locale: body.locale },
      },
      create: {
        i18nKeyId: existing.id,
        locale: body.locale,
        draftText: body.text,
        publishedText: body.text,
        ...stamp,
      },
      update: { draftText: body.text, publishedText: body.text, ...stamp },
    })
    const locales = await tx.localeValue.findMany({
      where: { i18nKeyId: existing.id },
    })
    await tx.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        userID: userId,
        i18nKeyId: existing.id,
        fingerprint,
        beforeData: localesToContent(existing.locales, 'published'),
        afterData: localesToContent(locales, 'published'),
      },
    })
    return locales
  })

  return {
    keyId: existing.id,
    locales: after.map((row) => ({
      locale: row.locale,
      draftText: row.draftText,
      publishedText: row.publishedText,
    })),
  }
})
