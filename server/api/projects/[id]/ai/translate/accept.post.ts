import { randomUUID } from 'node:crypto'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { applyAiWrites } from '#server/helper/ai-translate'
import { aiItemId } from '#server/helper/ai-translate-jobs'
import {
  loadAiPlan,
  loadGate,
  requireAiTranslate,
} from '#server/helper/ai-translate-service'
import { zAiTranslateAccept } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/ai/translate/accept
 * @description Save a proposal from `single` (`save: false`) as a draft. The
 * cell is checked again — it may have been filled since — and the text goes
 * through the exit gate, so what is saved is never worse than a batch's.
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
  const body = await readZodBody(event, zAiTranslateAccept.parse)

  const { sourceLocale, plan, quota } = await loadAiPlan(nID, {
    keyIds: [body.keyId],
    locales: [body.locale],
    overwriteDraft: true,
    includePublished: true,
  })
  const cell = plan[0]
  if (!cell) {
    throw createError({
      statusCode: 409,
      statusMessage:
        quota.remaining === 0
          ? "Today's AI translation quota for this project is used up"
          : 'This language can no longer take an AI translation',
    })
  }
  const gate = await loadGate(nID, sourceLocale)
  const gated = gate(
    {
      ...cell,
      id: aiItemId(cell.keyId, cell.locale),
      status: 'pending',
      text: null,
      applied: false,
    },
    body.text
  )
  if (gated.status === 'fail') {
    throw createError({
      statusCode: 422,
      statusMessage: 'The text breaks a rule and cannot be saved',
      data: { issues: gated.issues },
    })
  }
  const batchId = randomUUID()
  await applyAiWrites({
    batchId,
    userId,
    model,
    writes: [{ keyId: cell.keyId, locale: cell.locale, text: gated.text }],
  })
  return { batchId, text: gated.text, status: gated.status }
})
