import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import prisma from '#server/libs/prisma'
import { LogAction, LogStatus } from '#shared/constants/log'
import { requireTeamMember } from '#server/helper/access'
import { shapeI18nKey, upsertLocaleDrafts } from '#server/helper/i18n'

/**
 * @route POST /api/translation
 * @description Create a new I18nKey (compat: translation)
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = await readZodBody(event, zTranslation.parse)
  if (!body.origin) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing origin text',
    })
  }
  if (!body.projectId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing projectId',
    })
  }
  await requireTeamMember(event, body.projectId)

  let fingerprint = body.fingerprint || fpTranslation(body.origin)
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
      statusMessage: 'Translation already exists',
    })
  }

  if (existing && body.force) {
    fingerprint = fpTranslation(body.origin + Date.now())
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
        origin: body.origin,
        fingerprint,
      },
      update: {
        origin: body.origin,
        fingerprint,
      },
      include: { locales: true },
    })
    const content = body.vue || body.react
    if (content) {
      await upsertLocaleDrafts(record.id, content as Record<string, string | null | undefined>)
    }
    const loaded = await prisma.i18nKey.findUnique({
      where: { id: record.id },
      include: { locales: true },
    })
    await prisma.translationLog.create({
      data: {
        action: body.force ? LogAction.FORCE_CREATE : LogAction.CREATE,
        status: LogStatus.SUCCESS,
        beforeData: existing ?? undefined,
        afterData: loaded,
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
