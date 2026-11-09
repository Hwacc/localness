import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { aiTranslateJobs } from '#server/helper/ai-translate-service'
import { countAiItems } from '#server/helper/ai-translate-jobs'

/**
 * @route DELETE /api/projects/:id/ai/translate/:jobId
 * @description Stop a running batch: requests not sent yet are never sent, and
 * the rows already answered stay available to apply.
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
  const job = aiTranslateJobs.get(nID, jobId)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  }
  aiTranslateJobs.cancel(job)
  return { state: job.state, ...countAiItems(job.items) }
})
