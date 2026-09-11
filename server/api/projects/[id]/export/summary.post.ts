import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { zExportSelection } from '#shared/utils/schemas'
import { loadExportSelection } from '#server/helper/export-load'

/**
 * @route POST /api/projects/:id/export/summary
 * What the confirmed selection would produce. Counts only — no images, no
 * text — so step 2 can show it before anyone waits on a zip.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)
  const body = await readZodBody(event, zExportSelection.parse)
  const loaded = await loadExportSelection(projectId, body)
  if (!loaded) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  const { pages, result, localeColumns } = loaded
  return {
    keys: body.keyIds.length,
    rows: result.rows.length,
    tags: result.tagIds.length,
    pages: pages.length,
    locales: localeColumns,
    keysWithoutTag: result.keysWithoutTag,
    skipped: result.skipped,
  }
})
