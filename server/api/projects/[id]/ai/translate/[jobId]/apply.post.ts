import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  aiQuota,
  applyAiWrites,
  filledSincePlanned,
} from '#server/helper/ai-translate'
import {
  aiTranslateJobs,
  requireAiTranslate,
} from '#server/helper/ai-translate-service'
import { zAiTranslateApply } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/ai/translate/:jobId/apply
 * @description Write the rows the reviewer kept as drafts (never published),
 * stamped with the batch so it can be reverted. Only once the batch is no
 * longer running. A cell someone filled while the batch ran, or one the day's
 * quota no longer covers, is skipped and counted.
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const jobId = getRouterParam(event, 'jobId')
  if (!id || !jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  const { userId } = await requireTeamMember(event, nID)
  const { model } = await requireAiTranslate(nID)
  const job = aiTranslateJobs.get(nID, jobId)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Batch not found' })
  }
  if (job.state === 'running') {
    throw createError({
      statusCode: 409,
      statusMessage: 'The batch is still running',
    })
  }
  const body = await readZodBody(event, zAiTranslateApply.parse)

  const picked = body.items.map((pick) => ({
    pick,
    item: job.items.find((one) => one.id === pick.id),
  }))
  const unknown = picked.filter(
    ({ item }) => !item || item.status === 'pending' || item.status === 'error'
  )
  if (unknown.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Not a translated row of this batch: ${unknown
        .map(({ pick }) => pick.id)
        .join(', ')}`,
    })
  }
  const fresh = picked.filter(({ item }) => !item!.applied)
  const filled = await filledSincePlanned(fresh.map(({ item }) => item!))
  const open = fresh.filter(({ item }) => !filled.has(item!.id))
  const { remaining } = await aiQuota(nID)
  const allowed = remaining == null ? open : open.slice(0, remaining)

  const applied = await applyAiWrites({
    batchId: job.id,
    userId,
    model,
    writes: allowed.map(({ pick, item }) => ({
      keyId: item!.keyId,
      locale: item!.locale,
      text: pick.text,
    })),
  })
  for (const { item } of allowed) item!.applied = true
  return {
    batchId: job.id,
    applied,
    skipped: {
      alreadyApplied: picked.length - fresh.length,
      filled: fresh.length - open.length,
      quota: open.length - allowed.length,
    },
  }
})
