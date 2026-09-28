import { contentTypeForKey } from '#server/helper/upload'
import { OSSEngine } from '#shared/constants'

/**
 * @route GET /upload/:filename
 * @description Get a file
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { deadline } = getQuery<{ deadline: string }>(event)

  const filename = event.context.params?.filename
  if (!filename) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing filename',
    })
  }
  const ossStorage = event.context.ossStorage
  const engine =
    (process.env.NUXT_PUBLIC_OSS_ENGINE as OSSEngine) || OSSEngine.LOCAL
  // eslint-disable-next-line no-useless-assignment
  let file: any = ''
  switch (engine) {
    case OSSEngine.QINIU:
      // A signed URL, not bytes — the headers below would describe the wrong thing.
      file = await ossStorage.getItem(filename, { deadline: Number(deadline) })
      break
    case OSSEngine.LOCAL: {
      const key = getFileKey(filename)
      file = await ossStorage.getItemRaw(key)
      if (file) {
        /**
         * Without these the Buffer went out untyped, so the extension decided how
         * the browser read it — and the extension was uploader-controlled.
         * `nosniff` keeps the declared type from being second-guessed.
         */
        const { type, inline } = contentTypeForKey(key)
        setHeader(event, 'content-type', type)
        setHeader(event, 'x-content-type-options', 'nosniff')
        if (!inline) {
          setHeader(event, 'content-disposition', `attachment; filename="${key}"`)
        }
      }
      break
    }
    case OSSEngine.CLOUDFLARE:
      throw createError({
        statusCode: 501,
        statusMessage: 'CLOUDFLARE storage is not implemented',
      })
    default: {
      const _exhaustive: never = engine
      throw createError({
        statusCode: 500,
        statusMessage: `Unsupported OSS engine: ${_exhaustive}`,
      })
    }
  }
  if (!file) {
    throw createError({
      statusCode: 404,
      statusMessage: 'File not found',
    })
  }
  return file
})
