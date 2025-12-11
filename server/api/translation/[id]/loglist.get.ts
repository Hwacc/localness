
/**
 * @route get /api/translation/loglist
 * @description Get translation log list
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

})