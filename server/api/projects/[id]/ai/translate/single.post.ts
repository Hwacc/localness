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
import AgentManager from '#server/libs/agent'
import { zAiTranslateSingle } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/ai/translate/single
 * @description Translate one cell and stream it as it is written: `token`
 * events carry text to append, then one `done` with the gate verdict. A result
 * that passes (or was repaired) is saved as a draft under its own batch, so it
 * can be reverted; one that fails is only returned, for the reviewer to edit.
 * Reaches published text only when it lags the source.
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
  const body = await readZodBody(event, zAiTranslateSingle.parse)

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
          : 'Nothing to translate for this language',
    })
  }
  const gate = await loadGate(nID, sourceLocale)

  const stream = createEventStream(event)
  let closed = false
  stream.onClosed(() => {
    closed = true
  })
  const send = (name: string, data: unknown) =>
    stream.push({ event: name, data: JSON.stringify(data) })

  void (async () => {
    try {
      let text = ''
      for await (const piece of AgentManager.translateStream({
        sourceLocale,
        targetLocale: cell.locale,
        items: [
          { id: 'one', source: cell.source, key: cell.key, other: cell.other },
        ],
      })) {
        if (closed) return
        text += piece
        await send('token', { text: piece })
      }
      const item = { ...cell, id: aiItemId(cell.keyId, cell.locale) }
      const gated = gate(
        { ...item, status: 'pending', text: null, applied: false },
        text
      )
      let batchId: string | null = null
      if (gated.status !== 'fail') {
        batchId = randomUUID()
        await applyAiWrites({
          batchId,
          userId,
          model,
          writes: [{ keyId: cell.keyId, locale: cell.locale, text: gated.text }],
        })
      }
      await send('done', { ...gated, model, batchId })
    } catch (error) {
      await send('error', {
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await stream.close()
    }
  })()
  return stream.send()
})
