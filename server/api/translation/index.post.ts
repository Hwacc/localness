import { numericID } from '~/utils/id'
import { zTranslation } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'
import prisma from '~/server/libs/prisma'
import { fpTranslation } from '~/utils'

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
        action: 'INSERT',
        status: 'REFUSED',
        origin: body.origin,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    throw createError({
      statusCode: 409,
      statusMessage: 'Translation already exists',
    })
  }

  if(existing && body.force) {
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
      }
    })
    await prisma.translationLog.create({
      data: {
        action: body.force ? 'FORCE_INSERT' : 'INSERT',
        status: 'SUCCESS',
        origin: body.origin,
        fingerprint,
        userID: numericID(session.user.id),
      },
    })
    return translation
  } catch (error) {
    console.error(error)
    // record error log
    await prisma.translationLog.create({
      data: {
        action: body.force ? 'FORCE_INSERT' : 'INSERT',
        status: 'ERROR',
        origin: body.origin,
        fingerprint,
        userID: numericID(session.user.id),
      }
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create translation',
    })
  }
})
