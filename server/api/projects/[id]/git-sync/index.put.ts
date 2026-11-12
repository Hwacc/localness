import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectOwner } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import { GitSyncAdapter, GitSyncFolderMode } from '#shared/constants'
import {
  normalizeGitHttpsRemote,
  zGitSyncBindingPut,
} from '#shared/schemas'
import { gitSyncLayout } from '#server/libs/git-sync/layouts'
import {
  bindingLocationChanged,
  publicGitSyncBinding,
  resetGitSyncState,
} from '#server/libs/git-sync/sync'
import { withSyncLease } from '#server/libs/git-sync/engine/lease'
import {
  folderPeers,
  parseFolderMode,
  planFolderBinding,
} from '#server/libs/git-sync/engine/folder'

/**
 * @route PUT /api/projects/:id/git-sync
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const { session } = await requireProjectOwner(event, projectId)
  const username =
    typeof session.user.username === 'string'
      ? session.user.username
      : 'unknown'
  const body = await readZodBody(event, zGitSyncBindingPut.parse)
  const adapter = body.adapter ?? GitSyncAdapter.LILT_SWBU
  const scopeError = gitSyncLayout(adapter).scopeError(
    body.product,
    body.options
  )
  if (scopeError) {
    throw createError({ statusCode: 400, statusMessage: scopeError })
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
  const moved =
    existing != null &&
    bindingLocationChanged(existing, {
      adapter,
      remoteUrl,
      branch,
      product: body.product,
      options: body.options ?? existing.options,
    })
  const folderMode =
    body.folderMode ??
    (adapter === GitSyncAdapter.LILT_SWBU
      ? parseFolderMode(existing?.folderMode)
      : GitSyncFolderMode.EXCLUSIVE)
  const save = () =>
    prisma.$transaction(async (tx) => {
      const folder = planFolderBinding({
        adapter,
        mode: folderMode,
        existing: existing && {
          ...existing,
          sameFolder:
            existing.adapter === adapter &&
            existing.remoteUrl === remoteUrl &&
            existing.product === body.product,
        },
        peers: await folderPeers(
          { adapter, remoteUrl, product: body.product },
          projectId,
          tx
        ),
      })
      const saved = await tx.gitSyncBinding.upsert({
        where: { projectId },
        create: {
          projectId,
          enabled: body.enabled ?? true,
          adapter,
          remoteUrl,
          branch,
          product: body.product,
          ...(body.options ? { options: body.options } : {}),
          ...folder,
          credentialKind: body.credentialKind,
          token,
        },
        update: {
          enabled: body.enabled ?? true,
          adapter,
          remoteUrl,
          branch,
          product: body.product,
          ...(body.options ? { options: body.options } : {}),
          ...folder,
          credentialKind: body.credentialKind,
          ...(body.token && body.token.trim() ? { token: body.token.trim() } : {}),
        },
      })
      if (moved) await resetGitSyncState(projectId, tx)
      return saved
    })
  try {
    // A move resets bases and seen files; an apply running meanwhile would
    // write the old location's back, so the move waits for the lease.
    const row = moved
      ? await withSyncLease(projectId, username, save)
      : await save()
    return publicGitSyncBinding(row)
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : ''
    if (code === 'P2002') {
      // Only a batch tag can collide now, when two projects join one folder at once.
      throw createError({
        statusCode: 409,
        statusMessage: 'Another project bound this folder at the same time — save again',
      })
    }
    throw error
  }
})
