import prisma from '~/server/libs/prisma'

/**
 * @route GET /api/translation/check
 * @description Check if a translation exists
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { md5 } = getQuery<{ md5: string }>(event)
  if (!md5) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing md5',
    })
  }
  const translation = await prisma.translation.findUnique({
    where: {
      md5,
    },
    select: {
      id: true,
    },
  })
  return translation ? translation.id : null
})
