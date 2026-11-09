import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { AiJobBusyError } from '#server/helper/ai-translate-jobs'
import {
  aiTranslateJobs,
  requireAiTranslate,
} from '#server/helper/ai-translate-service'

/**
 * @route POST /api/projects/:id/ai/translate/:jobId/retry
 * @description Ask the model again for the rows that failed. Rows that were
 * answered, applied or not, are not touched.
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const jobId = getRouterParam(event, 'jobId')
  if (!id || !jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  await requireAiTranslate(nID)
  const job = aiTranslateJobs.get(nID, jobId)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  }
  try {
    return { retrying: aiTranslateJobs.retry(job) }
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
