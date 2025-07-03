import { generateDownloadAccessUrl } from '~/server/libs/qiniu'
import { z } from 'zod/v4'
import { readZodBody } from '~/utils/validate'

const zGen = z.object({
  key: z.string(),
  deadline: z.number().optional(),
}, 'Key and deadline are required')

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { key, deadline } = await readZodBody(event, zGen.parse)
  const url = generateDownloadAccessUrl(key, deadline)
  return url
})
