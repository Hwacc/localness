import { generateDownloadAccessUrl } from '~/server/libs/qiniu'
import { z } from 'zod/v4'

const zGen = z.object({
  key: z.string(),
  deadline: z.number().optional(),
})

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { key, deadline } = await readValidatedBody(event, zGen.parse)
  const url = generateDownloadAccessUrl(key, deadline)
  return url
})
