import { generateUploadToken } from '~/server/libs/qiniu'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const token = generateUploadToken()
  return token
})
