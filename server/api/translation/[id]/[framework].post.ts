import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'

/**
 * @route POST /api/translation/:id/:framework
 * @description Update a translation content
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
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

  if (framework === 'vue') {
    return await prisma.translationVue.upsert({
      where: {
        translationID: nID,
      },
      create: {
        translationID: nID,
        ...omit(body, ['id', 'translationID', 'createdAt', 'updatedAt']),
      },
      update: {
        ...omit(body, ['id', 'translationID', 'createdAt', 'updatedAt']),
      },
    })
  } else if (framework === 'react') {
    return await prisma.translationReact.upsert({
      where: {
        translationID: nID,
      },
      create: {
        translationID: nID,
        ...omit(body, ['id', 'translationID', 'createdAt', 'updatedAt']),
      },
      update: {
        ...omit(body, ['id', 'translationID', 'createdAt', 'updatedAt']),
      },
    })
  }
})
