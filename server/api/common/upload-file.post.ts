import OSSManager from '~/server/libs/oss'

/**
 * @route POST /api/common/upload-file
 * @description Upload a file
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const form = await readMultipartFormData(event)
  if (!form) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing file',
    })
  }

  const allFiles = form.filter((item) => item.type)

  allFiles.map(item => {
    if (!item.filename) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing filename',
      })
    }
    OSSManager.uploadAsset(item.filename, item.data)
  })
})