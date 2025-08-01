/**
 * @route POST /upload
 * @description Upload a file
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const ossStorage = event.context.ossStorage
  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file',
    })
  }
  const allFiles = form.filter((item) => item.type)
  const uploadedFiles = await Promise.all(
    allFiles.map(async (item) => {
      if (!item.filename) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Missing filename',
        })
      }
      try {
        const uidFilename = uuidFilename(item.filename)
        await ossStorage.setItemRaw(getFileKey(uidFilename), item.data)
        return uidFilename
      } catch (error) {
        console.error(error)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to upload file',
        })
      }
    })
  )

  return uploadedFiles.map((item) => getFileKey(item))
})
