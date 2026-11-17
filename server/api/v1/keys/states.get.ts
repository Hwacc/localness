import { authenticateDeliveryRequest, touchApiToken } from '#server/helper/api-token'
import { resolveTokenProject } from '#server/helper/api-token-project'
import { deliveryKeyStates, resolveDeliveryScope } from '#server/helper/api-delivery'
import type { DeliveryKeyStates } from '#shared/contract'

/**
 * @route GET /api/v1/keys/states
 * @description Per-key, per-locale draft/published/outdated state in bulk.
 * Draft text is included, so a read token can see unpublished copy here — the
 * one deliberate exception to "published only". `?locales=` is a comma list;
 * absent, every project locale is returned. `?keys=` is a comma list of key
 * names that narrows the result; unknown names are left out.
 */
export default defineEventHandler(async (event): Promise<DeliveryKeyStates> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const query = getQuery(event)
  const projectId = await resolveTokenProject(token, query.project)
  const scope = await resolveDeliveryScope(projectId, query)
  const list = (value: unknown) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const offset = typeof query.offset === 'string' ? Number(query.offset) : undefined

  const result = await deliveryKeyStates(projectId, scope, {
    locales: list(query.locales),
    keys: list(query.keys),
    offset,
    limit,
  })
  await touchApiToken(token)
  return result
})
