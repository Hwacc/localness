import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readClientConfig, resolveModel } from '#server/libs/agent/OpenAIAgent'
import { aiQuota } from '#server/helper/ai-translate'
import { aiTranslateJobs } from '#server/helper/ai-translate-service'

/**
 * @route GET /api/projects/:id/ai/translate
 * @description Whether AI pre-translation can run for this project, what is
 * left of today's quota, and the batch still running, if any (so a reopened
 * drawer can pick its stream back up).
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)

  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: nID },
    select: { aiTranslate: true },
  })
  return {
    enabled: Boolean(settings?.aiTranslate),
    configured: readClientConfig('translation') !== null,
    model: resolveModel('translation'),
    quota: await aiQuota(nID),
    activeJobId: aiTranslateJobs.active(nID)?.id ?? null,
  }
})
