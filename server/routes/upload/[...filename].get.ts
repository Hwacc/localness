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
  let file: any = ''
  if (process.env.NUXT_PUBLIC_OSS_ENGINE === OSSEngine.QINIU) {
    file = await ossStorage.getItem(filename, { deadline: Number(deadline) })
  } else if (process.env.NUXT_PUBLIC_OSS_ENGINE === OSSEngine.LOCAL) {
    file = await ossStorage.getItemRaw(getFileKey(filename))
  }
  if (!file) {
    throw createError({
      statusCode: 404,
      statusMessage: 'File not found',
    })
  }
  return file
})
