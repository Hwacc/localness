import { isEmpty } from 'lodash-es'
import OSSManager from '#server/libs/oss'

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
  const uploadedFiles = await Promise.all(
    allFiles.map((item) => {
      if (!item.filename) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Missing filename',
        })
      }
      return OSSManager.uploadAsset(uuidFilename(item.filename), item.data)
    })
  )

  if (isEmpty(uploadedFiles)) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload file',
    })
  }

  const result = uploadedFiles.map((item) => {
    return getFileKey(item)
  })

  return result
})
