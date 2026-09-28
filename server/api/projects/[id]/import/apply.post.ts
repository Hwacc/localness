import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { applyImport, throwImportHttp } from '#server/helper/i18n-import'
import { zI18nImportApply } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/import/apply
 * @description Writes an import: new keys are created published and out of Git
 * sync, and only the `changed` keys named in `overwriteKeys` are rewritten.
 * The batch is one transaction — it lands whole or not at all.
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
  const { userId } = await requireProjectOwner(event, projectId)
  const body = await readZodBody(event, zI18nImportApply.parse)
  try {
    return await applyImport({
      projectId,
      userId,
      payload: body.locales,
      overwriteKeys: body.overwriteKeys,
      releaseId: body.releaseId,
    })
  } catch (error) {
    throwImportHttp(error)
  }
})
