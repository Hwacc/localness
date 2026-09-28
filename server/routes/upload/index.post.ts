import { assertSkillStorageKey } from '#server/helper/project-skill'
import {
  assertUploadExtension,
  assertUploadSize,
  uploadKind,
} from '#server/helper/upload'
import { getFileKey, uuidFilename } from '#shared/utils/file'

/**
 * @route POST /upload
 * @description Upload a file
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const ossStorage = event.context.ossStorage

  /**
   * Fast-fail before `readMultipartFormData` buffers the whole body into memory.
   * The kind is not known yet — it comes out of the form — so this uses the
   * loosest limit; `content-length` is client-supplied anyway, which is why the
   * real decision is made per item below, on the bytes actually received.
   */
  const declaredLength = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    assertUploadSize('image', declaredLength)
  }

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

  const kind = uploadKind(requestedKey)
  const allFiles = form.filter((item) => item.type)
  const uploadedFiles = await Promise.all(
    allFiles.map(async (item) => {
      if (!item.filename) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Missing filename',
        })
      }
      assertUploadExtension(kind, requestedKey || item.filename)
      assertUploadSize(kind, item.data.length)
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
