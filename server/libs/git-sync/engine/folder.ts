import { randomBytes } from 'node:crypto'
import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import { GitSyncAdapter, GitSyncFolderMode } from '#shared/constants'

/**
 * Folder sharing rules. LILT does not create a folder per project, so several
 * projects may push into one product folder and tell their batches apart by a
 * tag in the batch id. Saving a binding and building a sync context both
 * consult this file; add rules here, not in the handlers.
 *
 * - An `exclusive` binding is alone on its folder and reads every file there.
 * - `shared` bindings coexist; each reads its own tag, plus untagged files
 *   when it owns them. At most one binding per folder owns untagged files.
 */

/** Which batches in the bound folder belong to one binding. */
export type FolderShare = {
  /** This binding's tag, written into every batch id it creates. */
  tag: string
  /** Tags of the other bindings on the folder: never ours. */
  otherTags: string[]
  /** Read batches whose tag belongs to no binding on the folder. */
  readUntagged: boolean
}

export type FolderPeer = {
  folderMode: string
  batchTag: string
  ownsUntagged: boolean
}

export type FolderLocation = {
  adapter: string
  remoteUrl: string
  product: string
}

const BATCH_TAG = /^[0-9a-f]{8}$/

export function parseFolderMode(value: string | null | undefined): GitSyncFolderMode {
  return value === GitSyncFolderMode.SHARED
    ? GitSyncFolderMode.SHARED
    : GitSyncFolderMode.EXCLUSIVE
}

export function newBatchTag(taken: Iterable<string>): string {
  const used = new Set(taken)
  for (;;) {
    const tag = randomBytes(4).toString('hex')
    if (!used.has(tag)) return tag
  }
}

/**
 * What a binding saves as its folder settings, or a 400/409 when the folder
 * cannot take it. `peers` are the other projects' bindings on the target folder.
 */
export function planFolderBinding(params: {
  adapter: string
  mode: GitSyncFolderMode
  /** The project's binding as saved; `sameFolder` when the save keeps its folder. */
  existing: (FolderPeer & { sameFolder: boolean }) | null
  peers: FolderPeer[]
}): { folderMode: GitSyncFolderMode; batchTag: string; ownsUntagged: boolean } {
  const { adapter, mode, existing, peers } = params
  const shared = mode === GitSyncFolderMode.SHARED
  if (shared && adapter !== GitSyncAdapter.LILT_SWBU) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only a LILT product folder can be shared',
    })
  }
  if (peers.some((peer) => parseFolderMode(peer.folderMode) !== GitSyncFolderMode.SHARED)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Another project uses this folder on its own',
    })
  }
  if (!shared && peers.length) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Other projects share this folder — choose Shared folder to join them',
    })
  }
  const taken = peers.map((peer) => peer.batchTag)
  const keep = existing?.batchTag ?? ''
  const batchTag =
    BATCH_TAG.test(keep) && !taken.includes(keep) ? keep : newBatchTag(taken)
  // The first binding on a folder inherits whatever was there before tags; a
  // later one never takes that over from a binding already holding it.
  const ownsUntagged =
    !shared ||
    peers.length === 0 ||
    (Boolean(existing?.sameFolder && existing.ownsUntagged) &&
      !peers.some((peer) => peer.ownsUntagged))
  return { folderMode: mode, batchTag, ownsUntagged }
}

export function folderShare(binding: FolderPeer, peers: FolderPeer[]): FolderShare {
  if (parseFolderMode(binding.folderMode) === GitSyncFolderMode.EXCLUSIVE) {
    return { tag: binding.batchTag, otherTags: [], readUntagged: true }
  }
  return {
    tag: binding.batchTag,
    otherTags: peers.map((peer) => peer.batchTag).filter(Boolean),
    readUntagged: binding.ownsUntagged,
  }
}

/** Other projects' bindings on the same folder. */
export async function folderPeers(
  location: FolderLocation,
  projectId: number,
  db: Pick<typeof prisma, 'gitSyncBinding'> = prisma
): Promise<FolderPeer[]> {
  return db.gitSyncBinding.findMany({
    where: {
      adapter: location.adapter,
      remoteUrl: location.remoteUrl,
      product: location.product,
      projectId: { not: projectId },
    },
    select: { folderMode: true, batchTag: true, ownsUntagged: true },
  })
}
