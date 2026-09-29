import { handleCors } from 'h3'
import { DELIVERY_CORS, isDeliveryApiPath } from '#server/helper/api-delivery'

/**
 * The delivery API is called from pages that are not ours — a design-tool
 * plugin runs in an iframe whose origin is `null` — and every call carries an
 * `Authorization` header, so the browser preflights it. Session routes stay
 * same-origin: nothing here widens them.
 */
export default defineEventHandler((event) => {
  if (!isDeliveryApiPath(event.path)) return
  handleCors(event, DELIVERY_CORS)
})
