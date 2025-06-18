import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }
  const project = await prisma.project.create({
    data: body,
  })
  return project
})
