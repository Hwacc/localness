import prisma from '#server/libs/prisma'

/**
 * @route GET /api/translation/check
 * @description Check if a translation exists
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { fp } = getQuery<{ fp: string }>(event)
  if (!fp) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing fingerprint',
    })
  }
  const translation = await prisma.translation.findUnique({
    where: {
      fingerprint: fp,
    },
    select: {
      id: true,
    },
  })
  return translation ? translation.id : null
})
