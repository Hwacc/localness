import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import prisma from '#server/libs/prisma'
import { LogAction, LogStatus } from '#shared/constants/log'
/**
 * @route POST /api/translation
 * @description Create a new translation
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

  let fingerprint = fpTranslation(body.origin)

  const existing = await prisma.translation.findUnique({
    where: {
      fingerprint,
    },
  })

  if (existing && !body.force) {
    await prisma.translationLog.create({
      data: {
        action: LogAction.CREATE,
        status: LogStatus.REFUSED,
        beforeData: existing,
        translationID: existing.id,
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
    const translation = await prisma.translation.create({
      data: {
        origin: body.origin,
        fingerprint,
      },
      include: {
        vue: true,
        react: true,
      },
    })
    await prisma.translationLog.create({
      data: {
        action: body.force ? LogAction.FORCE_CREATE : LogAction.CREATE,
        status: LogStatus.SUCCESS,
        beforeData: existing ?? undefined,
        afterData: translation,
        translationID: translation.id,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return translation
  } catch (error) {
    console.error(error)
    // record error log
    console.log('existing',  existing)
    await prisma.translationLog.create({
      data: {
        action: body.force ? LogAction.FORCE_CREATE : LogAction.CREATE,
        status: LogStatus.FAILED,
        beforeData: existing ?? undefined,
        translationID: existing ? existing.id : undefined,
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
