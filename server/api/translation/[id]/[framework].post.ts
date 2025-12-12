import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { LogAction, LogStatus } from '~~/shared/constants/log'

/**
 * @route POST /api/translation/:id/:framework
 * @description Update a translation content
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
  if (!framework || (framework !== 'vue' && framework !== 'react')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid framework',
    })
  }

  const nID = numericID(id)
  const body = await readZodBody(event, zTranslationContent.parse)
  const safeBody = omit(body, ['id', 'translationID', 'createdAt', 'updatedAt'])

  if (framework === 'vue') {
    const existing = await prisma.translationVue.findUnique({
      where: {
        translationID: nID,
      },
    })
    try {
      const upserted = await prisma.translationVue.upsert({
        where: {
          translationID: nID,
        },
        create: {
          translationID: nID,
          ...safeBody,
        },
        update: {
          ...safeBody,
        },
      })
      if (existing) {
        await prisma.translationLog.create({
          data: {
            action: LogAction.UPDATE,
            status: LogStatus.SUCCESS,
            beforeData: existing,
            afterData: upserted,
            translationID: nID,
            userID: numericID(session.user.id),
          },
        })
      } else {
        await prisma.translationLog.create({
          data: {
            action: LogAction.CREATE,
            status: LogStatus.SUCCESS,
            afterData: upserted,
            translationID: nID,
            userID: numericID(session.user.id),
          },
        })
      }
      return upserted
    } catch (error) {
      console.log(error)
      await prisma.translationLog.create({
        data: {
          action: existing ? LogAction.UPDATE : LogAction.CREATE,
          status: LogStatus.FAILED,
          beforeData: existing ?? undefined,
          translationID: nID,
          userID: numericID(session.user.id),
        },
      })
      throw createError({
        statusCode: 500,
        message: 'Fail to upsert vue translations',
      })
    }
  } else if (framework === 'react') {
    const existing = await prisma.translationReact.findUnique({
      where: {
        translationID: nID,
      },
    })
    try {
      const upserted = await prisma.translationReact.upsert({
        where: {
          translationID: nID,
        },
        create: {
          translationID: nID,
          ...safeBody,
        },
        update: {
          ...safeBody,
        },
      })
      if (existing) {
        await prisma.translationLog.create({
          data: {
            action: LogAction.UPDATE,
            status: LogStatus.SUCCESS,
            beforeData: existing,
            afterData: upserted,
            translationID: nID,
            userID: numericID(session.user.id),
          },
        })
      } else {
        await prisma.translationLog.create({
          data: {
            action: LogAction.CREATE,
            status: LogStatus.SUCCESS,
            afterData: upserted,
            translationID: nID,
            userID: numericID(session.user.id),
          },
        })
      }
      return upserted
    } catch (error) {
      console.log(error)
      await prisma.translationLog.create({
        data: {
          action: existing ? LogAction.UPDATE : LogAction.CREATE,
          status: LogStatus.FAILED,
          beforeData: existing ?? undefined,
          translationID: nID,
          userID: numericID(session.user.id),
        },
      })
      throw createError({
        statusCode: 500,
        message: 'Fail to upsert react translations',
      })
    }
  }
})
