import { OSSEngine } from '#shared/constants'

/**
 * @route GET /upload/token
 * @description Get a upload token for client upload
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const ossStorage = event.context.ossStorage
  if (process.env.NUXT_PUBLIC_OSS_ENGINE === OSSEngine.QINIU) {
    const token = (ossStorage as any).getPutToken()
    return token
  } else return ''
})
