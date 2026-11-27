import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { AiJobBusyError } from '#server/helper/ai-translate-jobs'
import {
  aiTranslateJobs,
  loadAiPlan,
  loadGate,
  requireAiTranslate,
} from '#server/helper/ai-translate-service'
import { zAiTranslateCreate } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/ai/translate
 * @description Plan a batch from the keys and languages given, start it in the
 * background and return its `jobId` at once. Results arrive on
 * GET …/translate/:jobId and are written only by …/apply. Cells that are not
 * eligible are left out; a run is cut to 200 cells and to what is left of the
 * day's quota (`capped` says by how many).
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  const { userId } = await requireTeamMember(event, nID)
  const { model } = await requireAiTranslate(nID)
  const body = await readZodBody(event, zAiTranslateCreate.parse)

  const { sourceLocale, plan, eligible, capped, quota } = await loadAiPlan(
    nID,
    body
  )
  if (!plan.length) {
    throw createError({
      statusCode: 409,
      statusMessage: eligible
        ? "Today's AI translation quota for this project is used up"
        : 'Nothing to translate in this selection',
      data: { eligible, quota },
    })
  }
  try {
    const job = aiTranslateJobs.start({
      projectId: nID,
      userId,
      model,
      sourceLocale,
      gate: await loadGate(nID, sourceLocale),
      plan,
    })
    return { jobId: job.id, model, total: plan.length, eligible, capped, quota }
  } catch (error) {
    if (error instanceof AiJobBusyError) {
      throw createError({
        statusCode: 409,
        statusMessage: error.message,
        data: { jobId: error.jobId },
      })
    }
    throw error
  }
})
