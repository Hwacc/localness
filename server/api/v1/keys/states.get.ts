import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { deliveryKeyStates, resolveDeliveryScope } from '#server/helper/api-delivery'
import type { DeliveryKeyStates } from '#shared/contract'

/**
 * @route GET /api/v1/keys/states
 * @description Per-key, per-locale draft/published/outdated state in bulk.
 * Draft text is included, so a read token can see unpublished copy here — the
 * one deliberate exception to "published only". `?locales=` is a comma list;
 * absent, every project locale is returned.
 */
export default defineEventHandler(async (event): Promise<DeliveryKeyStates> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const scope = await resolveDeliveryScope(projectId, query)
  const locales =
    typeof query.locales === 'string'
      ? query.locales
          .split(',')
          .map((locale) => locale.trim())
          .filter(Boolean)
      : undefined
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const offset = typeof query.offset === 'string' ? Number(query.offset) : undefined

  const result = await deliveryKeyStates(projectId, scope, {
    locales,
    offset,
    limit,
  })
  await touchApiToken(token)
  return result
})
