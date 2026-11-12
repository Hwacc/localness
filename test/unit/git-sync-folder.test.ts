import { describe, expect, it } from 'vitest'
import { folderShare, planFolderBinding } from '#server/libs/git-sync/engine/folder'
import { GitSyncAdapter, GitSyncFolderMode } from '#shared/constants'

const LILT = GitSyncAdapter.LILT_SWBU
const SHARED = GitSyncFolderMode.SHARED
const EXCLUSIVE = GitSyncFolderMode.EXCLUSIVE

function peer(batchTag: string, ownsUntagged = false, folderMode: string = SHARED) {
  return { folderMode, batchTag, ownsUntagged }
}

function statusOf(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  return 0
}

describe('planFolderBinding', () => {
  it('lets the first shared binding own files from before tagging', () => {
    const plan = planFolderBinding({ adapter: LILT, mode: SHARED, existing: null, peers: [] })
    expect(plan.batchTag).toMatch(/^[0-9a-f]{8}$/)
    expect(plan.ownsUntagged).toBe(true)
  })

  it('gives a joining binding a fresh tag and no untagged files', () => {
    const plan = planFolderBinding({
      adapter: LILT,
      mode: SHARED,
      existing: { ...peer('aaaaaaaa', true, EXCLUSIVE), sameFolder: false },
      peers: [peer('aaaaaaaa', true)],
    })
    expect(plan.batchTag).not.toBe('aaaaaaaa')
    expect(plan.ownsUntagged).toBe(false)
  })

  it('keeps tag and untagged ownership when an exclusive binding turns shared', () => {
    const plan = planFolderBinding({
      adapter: LILT,
      mode: SHARED,
      existing: { ...peer('aaaaaaaa', true, EXCLUSIVE), sameFolder: true },
      peers: [],
    })
    expect(plan).toEqual({ folderMode: SHARED, batchTag: 'aaaaaaaa', ownsUntagged: true })
  })

  it('refuses a folder another project holds on its own', () => {
    expect(
      statusOf(() =>
        planFolderBinding({
          adapter: LILT,
          mode: SHARED,
          existing: null,
          peers: [peer('aaaaaaaa', true, EXCLUSIVE)],
        })
      )
    ).toBe(409)
  })

  it('refuses exclusive use of a folder others share', () => {
    expect(
      statusOf(() =>
        planFolderBinding({ adapter: LILT, mode: EXCLUSIVE, existing: null, peers: [peer('aaaaaaaa')] })
      )
    ).toBe(409)
  })

  it('refuses sharing a locale-files directory', () => {
    expect(
      statusOf(() =>
        planFolderBinding({
          adapter: GitSyncAdapter.LOCALE_FILES,
          mode: SHARED,
          existing: null,
          peers: [],
        })
      )
    ).toBe(400)
  })
})

describe('folderShare', () => {
  it('reads everything when exclusive', () => {
    expect(folderShare(peer('aaaaaaaa', false, EXCLUSIVE), [peer('bbbbbbbb')])).toEqual({
      tag: 'aaaaaaaa',
      otherTags: [],
      readUntagged: true,
    })
  })

  it('skips peer tags when shared', () => {
    expect(folderShare(peer('aaaaaaaa'), [peer('bbbbbbbb', true)])).toEqual({
      tag: 'aaaaaaaa',
      otherTags: ['bbbbbbbb'],
      readUntagged: false,
    })
  })
})
