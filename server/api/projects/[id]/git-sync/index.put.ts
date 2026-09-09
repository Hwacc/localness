import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { GitSyncAdapter } from '#shared/constants'
import {
  normalizeGitHttpsRemote,
  zGitSyncBindingPut,
} from '#shared/utils/schemas'
import { isLiltProduct } from '#server/libs/git-sync/lilt-swbu'
import { publicGitSyncBinding } from '#server/libs/git-sync/sync'

/**
 * @route PUT /api/projects/:id/git-sync
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  await requireProjectOwner(event, projectId)
  const body = await readZodBody(event, zGitSyncBindingPut.parse)
  if (!isLiltProduct(body.product)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid product folder name',
    })
  }
  const existing = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
  })
  const token =
    body.token && body.token.trim().length > 0
      ? body.token.trim()
      : existing?.token ?? ''
  const normalized = normalizeGitHttpsRemote(body.remoteUrl)
  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Remote URL must be an https Git remote',
    })
  }
  const remoteUrl = normalized.remoteUrl
  const branch =
    body.branch?.trim() ||
    normalized.branch ||
    existing?.branch ||
    'main'
  try {
    const row = await prisma.gitSyncBinding.upsert({
      where: { projectId },
      create: {
        projectId,
        enabled: body.enabled ?? true,
        adapter: body.adapter ?? GitSyncAdapter.LILT_SWBU,
        remoteUrl,
        branch,
        product: body.product,
        credentialKind: body.credentialKind,
        token,
      },
      update: {
        enabled: body.enabled ?? true,
        adapter: body.adapter ?? GitSyncAdapter.LILT_SWBU,
        remoteUrl,
        branch,
        product: body.product,
        credentialKind: body.credentialKind,
        ...(body.token && body.token.trim() ? { token: body.token.trim() } : {}),
      },
    })
    return publicGitSyncBinding(row)
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : ''
    if (code === 'P2002') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This product is already bound to another project',
      })
    }
    throw error
  }
})
