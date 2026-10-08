import {
  authenticateDeliveryRequest,
  touchApiToken,
} from '#server/helper/api-token'
import { listTokenProjects } from '#server/helper/api-token-project'
import type { DeliveryProjects } from '#shared/types/Delivery'

/**
 * @route GET /api/v1/projects
 * @description Which projects this credential may address — the list `?project=`
 * accepts.
 *
 * A token belongs to a person and may name several projects, so a caller that
 * holds only a token has to be able to discover them: this is the step `meta`
 * cannot be, because `meta` answers about one project and must keep one shape.
 *
 * Filtered by live membership, so it is exactly what the next request can
 * succeed on. An empty list means the owner has left every team the token was
 * granted — the credential is spent, and the caller should say so rather than
 * retry.
 */
export default defineEventHandler(async (event): Promise<DeliveryProjects> => {
  const token = await authenticateDeliveryRequest(
    getRequestHeader(event, 'authorization')
  )
  const projects = await listTokenProjects(token)
  await touchApiToken(token)
  return { projects, generatedAt: new Date().toISOString() }
})