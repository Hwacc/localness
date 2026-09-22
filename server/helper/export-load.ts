import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import type { ZExportSelection } from '#shared/utils/schemas'
import {
  buildExportRows,
  exportLocaleColumns,
  type ExportRowsResult,
} from '#server/helper/export-rows'

/**
 * Loads everything the export and its summary need from one selection, so both
 * endpoints agree on the row count. `pages` keep their tags for painting.
 */
export async function loadExportSelection(
  projectId: number,
  selection: ZExportSelection
) {
  const pageIds = selection.pages.map((pageID) => numericID(pageID))
  const keyIds = selection.keyIds
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      settings: true,
      pages: {
        where: {
          AND: [
            { id: { in: pageIds } },
            { image: { not: null } },
            { image: { not: '' } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        include: { tags: true },
      },
    },
  })
  if (!project) return null

  const keys = keyIds.length
    ? await prisma.i18nKey.findMany({
        where: { projectId, id: { in: keyIds } },
        orderBy: { key: 'asc' },
        include: { locales: true },
      })
    : []

  const sourceLocale =
    project.settings?.localeFallback || DEFAULT_LOCALE_FALLBACK
  const localeColumns = exportLocaleColumns({
    locales: selection.locales,
    fallbackLocale: sourceLocale,
    includeFallbackLocale: selection.includeFallbackLocale,
  })

  const picByPageId = new Map(
    project.pages.map((page) => [page.id, `${page.name}.jpg`])
  )
  const result: ExportRowsResult = buildExportRows({
    keys: keys.map((key) => ({
      id: key.id,
      key: key.key,
      locales: key.locales.map((locale) => ({
        locale: locale.locale,
        publishedText: locale.publishedText,
      })),
    })),
    tags: project.pages.flatMap((page) =>
      page.tags.map((tag) => ({
        id: tag.id,
        pageId: page.id,
        i18nKeyId: tag.i18nKeyId,
      }))
    ),
    picByPageId,
    localeColumns,
  })

  return {
    project,
    pages: project.pages,
    localeColumns,
    result,
  }
}
