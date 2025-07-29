import { z } from 'zod/v4'
import { readZodBody } from '#server/helper/validate'
import OSSManager from '#server/libs/oss'

const zGen = z.object(
  {
    key: z.string(),
    deadline: z.number().optional(),
  },
  'Key is required'
)

/**
 * @route POST /api/common/gen-oss-url
 * @description Generate download oss url
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { key, deadline } = await readZodBody(event, zGen.parse)
  const url = OSSManager.generateDownloadAccessUrl(key, deadline)
  return url
})
