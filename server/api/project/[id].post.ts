import { omit } from 'lodash-es'
import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }

  const numericID = parseInt(id, 10)
  if (isNaN(numericID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const body = await readBody(event)

  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }

  const project = await prisma.project.update({
    where: {
      id: numericID,
    },
    data: omit(body, 'id', 'pages'),
  })

  return project.id
})
