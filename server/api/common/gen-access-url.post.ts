import { generateDownloadAccessUrl } from '~/libs/qiniu'
import zod from 'zod'

const zGen = zod.object({
  key: zod.string(),
  deadline: zod.number().optional(),
})

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { key, deadline } = await readValidatedBody(event, zGen.parse)
  const url = generateDownloadAccessUrl(key, deadline)
  return url
})
