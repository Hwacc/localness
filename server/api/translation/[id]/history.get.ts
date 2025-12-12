
/**
 * @route get /api/translation/history
 * @description Get translation history list
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

})