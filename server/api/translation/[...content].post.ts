import { omit } from 'lodash-es'
import prisma from '~/server/libs/prisma'
import { numericID } from '~/utils/id'
import { zTranslationContent } from '~/utils/schemas'
import { readZodBody } from '~/utils/validate'


export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const pathname = event.context.params?.content
  if (!pathname) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing path name',
    })
  }

  const params = pathname.split('/')
  const id = params[0]
  const framework = params[1]
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
