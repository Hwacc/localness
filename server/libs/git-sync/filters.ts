import {
  GitSyncPullReason,
  GitSyncPushReason,
} from '#shared/constants'
import { DRAFT_KEY_PREFIX } from '#shared/utils'

/**
 * Pure filter rules shared by pull and push. Kept free of Prisma and fs so
 * the decision logic can be tested on its own.
 */

/**
 * Why a remote batch file is (or is not) a pull candidate.
 *
 * Legacy `seenFiles` rows carry no sha. Those count as seen rather than
 * churning every historical file back into the candidate list.
 */
export function classifyFile(
  relPath: string,
  sha: string,
  seen: Map<string, string>
): GitSyncPullReason {
  if (!seen.has(relPath)) return GitSyncPullReason.NEW_FILE
  const knownSha = seen.get(relPath) ?? ''
  if (!knownSha) return GitSyncPullReason.SEEN_FILE
  return knownSha === sha
    ? GitSyncPullReason.SEEN_FILE
    : GitSyncPullReason.CHANGED_FILE
}

/** Why a source key is (or is not) proposed for push. */
export function classifyPush(
  key: string,
  text: string,
  lastPushed: Map<string, string>
): GitSyncPushReason {
  if (key.startsWith(DRAFT_KEY_PREFIX)) return GitSyncPushReason.DRAFT_KEY
  if (!text) return GitSyncPushReason.NOT_PUBLISHED
  if (!lastPushed.has(key)) return GitSyncPushReason.NEW_KEY
  return lastPushed.get(key) === text
    ? GitSyncPushReason.UNCHANGED
    : GitSyncPushReason.CHANGED
}

/** Reasons that make a push candidate selected by default. */
export function isPushEligible(reason: GitSyncPushReason): boolean {
  return (
    reason === GitSyncPushReason.NEW_KEY ||
    reason === GitSyncPushReason.CHANGED
  )
}

/** Reasons that make a pull file selected by default. */
export function isPullProposed(reason: GitSyncPullReason): boolean {
  return (
    reason === GitSyncPullReason.NEW_FILE ||
    reason === GitSyncPullReason.CHANGED_FILE
  )
}
