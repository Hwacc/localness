import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { loadExportSelection } from '#server/helper/export-load'

/**
 * @route POST /api/project/export/:id
 * @description Export the confirmed selection: screenshots for the chosen
 * pages plus one xlsx row per tag (or a `pic`-less row for a key with no tag).
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)

  const body = await readValidatedBody(event, zExport.parse)
  const loaded = await loadExportSelection(nID, body)
  if (!loaded) return null

  const { project, pages, result, localeColumns } = loaded
  const drawnTagIds = new Set(result.tagIds)
  return {
    ...project,
    // Only tags of selected keys are drawn, so the screenshots match the sheet.
    pages: pages.map((page) => ({
      ...page,
      tags: page.tags.filter((tag) => drawnTagIds.has(tag.id)),
    })),
    localeColumns,
    rows: result.rows,
    skipped: result.skipped,
    keysWithoutTag: result.keysWithoutTag,
  }
})
