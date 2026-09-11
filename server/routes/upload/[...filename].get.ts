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
  let file: any = ''
  switch (engine) {
    case OSSEngine.QINIU:
      file = await ossStorage.getItem(filename, { deadline: Number(deadline) })
      break
    case OSSEngine.LOCAL:
      file = await ossStorage.getItemRaw(getFileKey(filename))
      break
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
