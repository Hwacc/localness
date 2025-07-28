import OSSManager from '#server/libs/oss'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const token = OSSManager.generateUploadToken()
  return token
})
