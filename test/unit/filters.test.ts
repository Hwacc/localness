import { describe, expect, it } from 'vitest'
import {
  classifyFile,
  classifyPush,
  isPullProposed,
  isPushEligible,
  isPushSelectable,
} from '#server/libs/git-sync/filters'
import {
  GitSyncPullReason,
  GitSyncPushReason,
} from '#shared/constants'

describe('classifyPush', () => {
  const base = new Map([['known', 'text']])
  const remoteAtBase = new Map([['known', 'text']])

  it('proposes keys never pushed before', () => {
    expect(classifyPush('fresh', 'text', base, new Map())).toBe(
      GitSyncPushReason.NEW_KEY
    )
  })

  it('proposes keys whose published text moved and remote did not', () => {
    expect(classifyPush('known', 'other', base, remoteAtBase)).toBe(
      GitSyncPushReason.CHANGED
    )
  })

  it('filters out keys identical to the last landing and to git', () => {
    expect(classifyPush('known', 'text', base, remoteAtBase)).toBe(
      GitSyncPushReason.UNCHANGED
    )
  })

  it('filters out keys with no published source text', () => {
    expect(classifyPush('known', '', base, remoteAtBase)).toBe(
      GitSyncPushReason.NOT_PUBLISHED
    )
  })

  it('filters out auto draft keys even when published', () => {
    expect(classifyPush('__draft_abc123', 'text', base, remoteAtBase)).toBe(
      GitSyncPushReason.DRAFT_KEY
    )
  })

  it('does not propose a key when only remote source moved', () => {
    expect(
      classifyPush('known', 'text', base, new Map([['known', 'theirs']]))
    ).toBe(GitSyncPushReason.REMOTE_CHANGED)
  })

  it('conflicts when platform and remote both moved', () => {
    expect(
      classifyPush('known', 'ours', base, new Map([['known', 'theirs']]))
    ).toBe(GitSyncPushReason.CONFLICT)
  })

  it('only proposes new and changed by default', () => {
    expect(isPushEligible(GitSyncPushReason.NEW_KEY)).toBe(true)
    expect(isPushEligible(GitSyncPushReason.CHANGED)).toBe(true)
    expect(isPushEligible(GitSyncPushReason.UNCHANGED)).toBe(false)
    expect(isPushEligible(GitSyncPushReason.NOT_PUBLISHED)).toBe(false)
    expect(isPushEligible(GitSyncPushReason.DRAFT_KEY)).toBe(false)
    expect(isPushEligible(GitSyncPushReason.REMOTE_CHANGED)).toBe(false)
    expect(isPushEligible(GitSyncPushReason.CONFLICT)).toBe(false)
  })

  it('lets the user opt in to overwrite a remote-ahead key', () => {
    expect(isPushSelectable(GitSyncPushReason.REMOTE_CHANGED)).toBe(true)
    expect(isPushSelectable(GitSyncPushReason.NEW_KEY)).toBe(true)
    expect(isPushSelectable(GitSyncPushReason.CONFLICT)).toBe(false)
  })
})

describe('classifyFile', () => {
  it('proposes files never seen before', () => {
    expect(classifyFile('a.json', 'sha1', new Map())).toBe(
      GitSyncPullReason.NEW_FILE
    )
  })

  it('skips files whose bytes are unchanged', () => {
    const seen = new Map([['a.json', 'sha1']])
    expect(classifyFile('a.json', 'sha1', seen)).toBe(
      GitSyncPullReason.SEEN_FILE
    )
  })

  it('re-proposes a seen file that was rewritten', () => {
    const seen = new Map([['a.json', 'sha1']])
    expect(classifyFile('a.json', 'sha2', seen)).toBe(
      GitSyncPullReason.CHANGED_FILE
    )
  })

  it('treats legacy rows with no sha as seen', () => {
    // Migrating from `string[]` must not churn every historical file back
    // into the candidate list.
    const seen = new Map([['a.json', '']])
    expect(classifyFile('a.json', 'sha1', seen)).toBe(
      GitSyncPullReason.SEEN_FILE
    )
  })

  it('only proposes new and changed by default', () => {
    expect(isPullProposed(GitSyncPullReason.NEW_FILE)).toBe(true)
    expect(isPullProposed(GitSyncPullReason.CHANGED_FILE)).toBe(true)
    expect(isPullProposed(GitSyncPullReason.SEEN_FILE)).toBe(false)
  })
})
