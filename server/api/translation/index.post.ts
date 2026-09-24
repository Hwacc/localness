import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import prisma from '#server/libs/prisma'
import { LogAction, LogStatus } from '#shared/constants/log'
import { requireTeamMember } from '#server/helper/access'
import {
  shapeI18nKey,
  sourceLocaleOf,
  sourceTextOf,
  upsertLocaleDrafts,
} from '#server/helper/i18n'
import {
  assertReleaseIdsInProject,
  setEntryReleases,
  throwReleaseHttp,
} from '#server/helper/release'
import { keyClashMessage } from '#server/helper/key-convention'

/**
 * @route POST /api/translation
 * @description Create a new I18nKey (compat: translation)
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readZodBody(event, zTranslation.parse)
  if (!body.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing projectId',
    })
  }
  await requireTeamMember(event, body.projectId)
  // Resolved once: the clash message, the shaped row and the source text below
  // all need to know where this project keeps a key's original text.
  const sourceLocale = await sourceLocaleOf(body.projectId)

  /* The source language's entry is the original text; blank means there is none. */
  const content = body.vue || body.react
  const sourceText = String(content?.[sourceLocale] ?? '').trim()
  if (!sourceText) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing source text',
    })
  }

  // Checked before the key is written: a bad label id should not leave a
  // half-created translation behind.
  let attachReleaseIds: number[] = []
  try {
    attachReleaseIds = await assertReleaseIdsInProject({
      projectId: body.projectId,
      releaseIds: body.releaseIds ?? [],
    })
  } catch (error) {
    throwReleaseHttp(error)
  }

  let fingerprint = body.fingerprint || fpTranslation(sourceText)
  const key = (body.key && String(body.key).trim()) || `__draft_${fingerprint}`

  const existing = await prisma.i18nKey.findUnique({
    where: {
      projectId_key: { projectId: body.projectId, key },
    },
    include: { locales: true },
  })

  if (existing && !body.force) {
    await prisma.translationLog.create({
      data: {
        action: LogAction.CREATE,
        status: LogStatus.REFUSED,
        beforeData: existing,
        i18nKeyId: existing.id,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 409,
      statusMessage: keyClashMessage(
        {
          key: existing.key,
          sourceText: sourceTextOf(existing.locales, sourceLocale),
        },
        sourceText
      ),
    })
  }

  if (existing && body.force) {
    fingerprint = fpTranslation(sourceText + Date.now())
  }

  try {
    const record = await prisma.i18nKey.upsert({
      where: {
        projectId_key: {
          projectId: body.projectId,
          key: body.force && existing ? `__draft_${fingerprint}` : key,
        },
      },
      create: {
        projectId: body.projectId,
        key: body.force && existing ? `__draft_${fingerprint}` : key,
        fingerprint,
      },
      update: {
        fingerprint,
      },
      include: { locales: true },
    })
    const content = body.vue || body.react
    if (content) {
      await upsertLocaleDrafts(record.id, content as Record<string, string | null | undefined>)
    }
    if (attachReleaseIds.length) {
      await setEntryReleases({
        projectId: body.projectId,
        kind: 'key',
        id: record.id,
        releaseIds: attachReleaseIds,
      })
    }
    const loaded = await prisma.i18nKey.findUnique({
      where: { id: record.id },
      include: { locales: true, releases: { select: { releaseId: true } } },
    })
    await prisma.translationLog.create({
      data: {
        action: body.force ? LogAction.FORCE_CREATE : LogAction.CREATE,
        status: LogStatus.SUCCESS,
        beforeData: existing ?? undefined,
        afterData: loaded ?? undefined,
        i18nKeyId: record.id,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return loaded ? shapeI18nKey(loaded) : null
  } catch (error) {
    console.error(error)
    await prisma.translationLog.create({
      data: {
        action: body.force ? LogAction.FORCE_CREATE : LogAction.CREATE,
        status: LogStatus.FAILED,
        beforeData: existing ?? undefined,
        i18nKeyId: existing ? existing.id : undefined,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create translation',
    })
  }
})
