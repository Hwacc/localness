import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { aiTranslateJobs } from '#server/helper/ai-translate-service'

/**
 * @route GET /api/projects/:id/ai/translate/:jobId
 * @description Server-sent events of one batch: `progress`, `item` (one result
 * with its gate verdict) and `done`. Every event carries an id and the whole
 * history is replayed from `Last-Event-ID` on, so a reconnect — or a drawer
 * reopened after a refresh — catches up without losing a row.
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

  const last = Number.parseInt(getHeader(event, 'last-event-id') ?? '', 10)
  const stream = createEventStream(event)
  let queue = Promise.resolve()
  const close = () => {
    queue = queue.then(() => stream.close())
  }
  const unsubscribe = aiTranslateJobs.subscribe(
    job,
    Number.isFinite(last) ? last + 1 : 0,
    (entry) => {
      queue = queue.then(() =>
        stream.push({
          id: String(entry.id),
          event: entry.event,
          data: JSON.stringify(entry.data),
        })
      )
      if (entry.event === 'done' && job.state !== 'running') close()
    }
  )
  stream.onClosed(unsubscribe)
  // Nothing more will come: a reconnect after the end would otherwise hang.
  if (job.state !== 'running') close()
  return stream.send()
})
