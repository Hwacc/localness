import { licenseState } from '#server/helper/license'

/**
 * @route GET /api/license
 * @description The instance's Plus state for the Settings drawer.
 *
 * Session-gated and full-detail: unlike `/api/v1/meta`'s `instance` (which
 * tells a plugin only whether Plus is on), this includes the customer and
 * expiry a human needs to act on — so it never leaves the authenticated UI.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return licenseState()
})
