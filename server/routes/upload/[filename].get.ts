/**
 * @route GET /upload/:filename
 * @description Get a file
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const filename = event.context.params?.filename
  if (!filename) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing filename',
    })
  }

  const ossStorage = event.context.ossStorage
  const file = await ossStorage.getItemRaw(getFileKey(filename))
  if (!file) {
    throw createError({
      statusCode: 404,
      statusMessage: 'File not found',
    })
  }
  return file
})
