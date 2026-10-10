import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { sourceLocaleOf } from '#server/helper/i18n'
import prisma from '#server/libs/prisma'
import type { DeliveryOutdated } from '#shared/types/Delivery'
import { isTranslationOutdated } from '#shared/utils/outdated'

/**
 * @route GET /api/v1/outdated
 * @description Keys whose non-source translation was written against an older
 * source sentence. The bundle itself is unchanged; this is only a marker.
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
      i18nKey: { select: { key: true, fingerprint: true } },
    },
  })
  const outdated: Record<string, string[]> = {}
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
    const keys = outdated[row.locale] ?? []
    keys.push(row.i18nKey.key)
    outdated[row.locale] = keys
  }
  await touchApiToken(token)
  return { outdated }
})
