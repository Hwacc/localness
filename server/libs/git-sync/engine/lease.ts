import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import { GIT_SYNC_LEASE_TTL_MS, GitSyncErrorCode } from '#shared/constants'
import { gitSyncError } from './errors'

function syncBusyError(owner: string) {
  return gitSyncError(
    409,
    GitSyncErrorCode.SYNC_BUSY,
    `${owner || 'Someone'} is syncing this project — try again when it finishes`
  )
}

/**
 * For previews, which do not take the lease. A preview made while an apply
 * runs photographs the remote halfway, and would cancel the very preview that
 * apply is landing.
 */
export async function assertNoSyncRunning(projectId: number) {
  const binding = await prisma.gitSyncBinding.findUnique({
    where: { projectId },
    select: { leaseOwner: true, leaseUntil: true },
  })
  if (binding?.leaseUntil && binding.leaseUntil.getTime() > Date.now()) {
    throw syncBusyError(binding.leaseOwner)
  }
}

/**
 * Runs `run` while holding the project's sync lease, so two applies (or an
 * apply and a location change) never interleave. SQLite has no row or
 * advisory locks and a lock in this process would not hold across instances,
 * so the lease is a conditional update on the binding row. An expired lease
 * is free: a holder that died blocks the project for one TTL at most.
 */
export async function withSyncLease<T>(
  projectId: number,
  owner: string,
  run: () => Promise<T>
): Promise<T> {
  const leaseId = randomUUID()
  const now = new Date()
  const taken = await prisma.gitSyncBinding.updateMany({
    where: {
      projectId,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseId,
      leaseOwner: owner,
      leaseUntil: new Date(now.getTime() + GIT_SYNC_LEASE_TTL_MS),
    },
  })
  if (!taken.count) {
    const holder = await prisma.gitSyncBinding.findUnique({
      where: { projectId },
      select: { leaseOwner: true },
    })
    if (!holder) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Git sync is not configured',
      })
    }
    throw syncBusyError(holder.leaseOwner)
  }
  try {
    return await run()
  } finally {
    await prisma.gitSyncBinding.updateMany({
      where: { projectId, leaseId },
      data: { leaseId: '', leaseOwner: '', leaseUntil: null },
    })
  }
}
