import { OSSEngine } from '#shared/constants'
import { getFileKey, uuidFilename } from '#shared/utils/file'
import {
  assertUploadExtension,
  assertUploadSize,
} from '#server/helper/upload'
import { authenticateWriteRequest, touchApiToken } from '#server/helper/api-token'
import type { UploadResult } from '#shared/types/Import'

/**
 * Screenshot upload for the import API. Same hardening as `/upload`, minus the
 * session: `assertUploadExtension` / `assertUploadSize` are the boundary, and
 * the stored name is always server-minted — a caller never picks the extension.
 *
 * The multipart read stays in the endpoint on purpose: `test/stubs/h3.ts` only
 * stands in for `createError`, so `readMultipartFormData` cannot be exercised
 * from a helper. The rules it composes are the ones that are unit-tested.
 *
 * LOCAL only. `QiniuDriver` has no server-side write at all (`setItem` throws),
 * which is why the QINIU engine normally uploads straight from the browser with
 * a put token. A 501 says that plainly instead of failing as a 500.
 */
export default defineEventHandler(async (event): Promise<UploadResult> => {
  const token = await authenticateWriteRequest(
    getRequestHeader(event, 'authorization')
  )

  const engine =
    (process.env.NUXT_PUBLIC_OSS_ENGINE as OSSEngine) || OSSEngine.LOCAL
  if (engine !== OSSEngine.LOCAL) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Importing images is not supported on this storage engine yet',
    })
  }

  const declaredLength = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    assertUploadSize('image', declaredLength)
  }

  const form = await readMultipartFormData(event)
  const item = form?.find((part) => part.filename && part.type)
  if (!item?.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }
  assertUploadExtension('image', item.filename)
  assertUploadSize('image', item.data.length)

  const storedKey = getFileKey(uuidFilename(item.filename))
  try {
    await event.context.ossStorage.setItemRaw(storedKey, item.data)
  } catch (error) {
    console.error(error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to store file' })
  }

  await touchApiToken(token)
  return { key: storedKey }
})