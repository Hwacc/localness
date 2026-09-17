import { assertSkillStorageKey } from '#server/helper/project-skill'
import { getFileKey, uuidFilename } from '#shared/utils/file'

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
  const requestedKeyField = form.find(
    (item) => item.name === 'key' && !item.filename
  )
  const requestedKey = requestedKeyField
    ? Buffer.from(requestedKeyField.data).toString('utf8').trim()
    : ''
  if (requestedKey) {
    assertSkillStorageKey(requestedKey)
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
        const storedKey = requestedKey || getFileKey(uidFilename)
        await ossStorage.setItemRaw(storedKey, item.data)
        return storedKey
      } catch (error) {
        console.error(error)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to upload file',
        })
      }
    })
  )

  return uploadedFiles
})
