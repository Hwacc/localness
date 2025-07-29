import { requireAgentJWT } from "#server/helper/guard"
import { readZodBody } from "#server/helper/validate"

/**
 * @route POST /api/ai/gen-i18n-key
 * @description Generate i18n key
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const agentJWT = await requireAgentJWT(event)
  
  // const { tagID } = await readZodBody(event)
  //TODO: do agent call

  

  return 'good'
})