export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  clearUserSession(event)
  return { success: true }
})
