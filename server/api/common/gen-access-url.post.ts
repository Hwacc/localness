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

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { key, deadline } = await readZodBody(event, zGen.parse)
  const url = OSSManager.generateDownloadAccessUrl(key, deadline)
  return url
})
