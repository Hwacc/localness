import {
  GitSyncPullReason,
  GitSyncPushReason,
} from '#shared/constants'
import { DRAFT_KEY_PREFIX } from '#shared/utils'
import { decideThreeWay } from './three-way'

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

/**
 * Why a source key is (or is not) proposed for push.
 * `remote` is the merged `source/` map (later filename wins). Missing keys
 * are treated as empty so three-way matches Pull.
 */
export function classifyPush(
  key: string,
  text: string,
  lastPushed: Map<string, string>,
  remote: Map<string, string>
): GitSyncPushReason {
  if (key.startsWith(DRAFT_KEY_PREFIX)) return GitSyncPushReason.DRAFT_KEY
  if (!text) return GitSyncPushReason.NOT_PUBLISHED
  const decision = decideThreeWay(
    lastPushed.get(key) ?? '',
    text,
    remote.get(key) ?? ''
  )
  switch (decision) {
    case 'align':
      return GitSyncPushReason.UNCHANGED
    case 'apply-theirs':
      return GitSyncPushReason.REMOTE_CHANGED
    case 'keep-ours':
      return lastPushed.has(key)
        ? GitSyncPushReason.CHANGED
        : GitSyncPushReason.NEW_KEY
    case 'conflict':
      return GitSyncPushReason.CONFLICT
    default: {
      const _exhaustive: never = decision
      return _exhaustive
    }
  }
}

export function emptyPushCounts(): Record<GitSyncPushReason, number> {
  return {
    [GitSyncPushReason.NEW_KEY]: 0,
    [GitSyncPushReason.CHANGED]: 0,
    [GitSyncPushReason.UNCHANGED]: 0,
    [GitSyncPushReason.NOT_PUBLISHED]: 0,
    [GitSyncPushReason.DRAFT_KEY]: 0,
    [GitSyncPushReason.REMOTE_CHANGED]: 0,
    [GitSyncPushReason.CONFLICT]: 0,
  }
}

/** Reasons that make a push candidate selected by default. */
export function isPushEligible(reason: GitSyncPushReason): boolean {
  return (
    reason === GitSyncPushReason.NEW_KEY ||
    reason === GitSyncPushReason.CHANGED
  )
}

/**
 * Remote-ahead keys are not proposed, but the user may check them to
 * overwrite Git with platform published.
 */
export function isPushSelectable(reason: GitSyncPushReason): boolean {
  return isPushEligible(reason) || reason === GitSyncPushReason.REMOTE_CHANGED
}

/** Reasons that make a pull file selected by default. */
export function isPullProposed(reason: GitSyncPullReason): boolean {
  return (
    reason === GitSyncPullReason.NEW_FILE ||
    reason === GitSyncPullReason.CHANGED_FILE
  )
}
