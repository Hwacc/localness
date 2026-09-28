import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { previewImport } from '#server/helper/i18n-import'
import { zI18nImportPreview } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/import/preview
 * @description What importing these locale files would do, key by key. Writes
 * nothing; apply re-runs the same classification rather than trusting this one.
 *
 * Project Owner only: an import lands published, straight into the delivery API.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const body = await readZodBody(event, zI18nImportPreview.parse)
  return previewImport({ projectId, payload: body.locales })
})
