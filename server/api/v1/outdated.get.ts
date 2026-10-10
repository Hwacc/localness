import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { sourceLocaleOf } from '#server/helper/i18n'
import prisma from '#server/libs/prisma'
import type { DeliveryOutdated } from '#shared/types/Delivery'
import { isI18nKeyDraft } from '#shared/utils'
import { isTranslationOutdated } from '#shared/utils/outdated'

/**
 * @route GET /api/v1/outdated
 * @description Keys whose non-source translation was written against an older
 * source sentence. The bundle itself is unchanged; this is only a marker.
 * Draft keys are skipped — they can still change, so nothing about them is
 * stale yet. Two phases on purpose: every non-source row is cheap to compare,
 * and only the mismatched keys are worth a second query for draft status.
 */
export default defineEventHandler(async (event): Promise<DeliveryOutdated> => {
  const token = await authenticateDeliveryRequest(getRequestHeader(event, 'authorization'))
  const projectId = await resolveTokenProject(token, getQuery(event).project)
  const sourceLocale = await sourceLocaleOf(projectId)
  const rows = await prisma.localeValue.findMany({
    where: { i18nKey: { projectId }, NOT: { locale: sourceLocale } },
    select: {
      locale: true,
      draftText: true,
      publishedText: true,
      sourceFingerprint: true,
      i18nKey: { select: { id: true, key: true, fingerprint: true } },
    },
  })
  const candidates: Array<{ keyId: number; key: string; locale: string }> = []
  for (const row of rows) {
    if (
      !isTranslationOutdated({
        locale: row.locale,
        sourceLocale,
        draftText: row.draftText,
        publishedText: row.publishedText,
        sourceFingerprint: row.sourceFingerprint,
        keyFingerprint: row.i18nKey.fingerprint,
      })
    ) {
      continue
    }
    candidates.push({ keyId: row.i18nKey.id, key: row.i18nKey.key, locale: row.locale })
  }
  let draftKeys = new Set<number>()
  if (candidates.length) {
    const keyIds = [...new Set(candidates.map((hit) => hit.keyId))]
    const keys = await prisma.i18nKey.findMany({
      where: { id: { in: keyIds } },
      select: { id: true, locales: { select: { draftText: true, publishedText: true } } },
    })
    draftKeys = new Set(keys.filter((key) => isI18nKeyDraft(key.locales)).map((key) => key.id))
  }
  const outdated: Record<string, string[]> = {}
  for (const hit of candidates) {
    if (draftKeys.has(hit.keyId)) continue
    const keys = outdated[hit.locale] ?? []
    keys.push(hit.key)
    outdated[hit.locale] = keys
  }
  await touchApiToken(token)
  return { outdated }
})
