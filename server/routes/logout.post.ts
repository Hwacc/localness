/**
 * @route POST /api/logout
 * @description Logout
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  clearUserSession(event)
  return { success: true }
})
