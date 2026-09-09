import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  normalizeGitHttpsRemote,
  zGitSyncDiscoverProducts,
} from '#shared/utils/schemas'
import { discoverLiltProducts } from '#server/libs/git-sync/sync'

/**
 * @route POST /api/projects/:id/git-sync/products
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const body = await readZodBody(event, zGitSyncDiscoverProducts.parse)
  const existing = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
  })
  const token =
    body.token && body.token.trim().length > 0
      ? body.token.trim()
      : existing?.token ?? ''
  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required to list products',
    })
  }
  const normalized = normalizeGitHttpsRemote(body.remoteUrl)
  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Remote URL must be an https Git remote',
    })
  }
  return discoverLiltProducts({
    remoteUrl: normalized.remoteUrl,
    branch: body.branch?.trim() || normalized.branch || existing?.branch || 'main',
    credentialKind: body.credentialKind,
    token,
  })
})
