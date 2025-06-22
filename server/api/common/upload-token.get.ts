import { generateUploadToken } from '~/lib/qiniu'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const token = generateUploadToken()
  return token
})
