import { describe, expect, it } from 'vitest'
import {
  defaultReleaseIdForFilter,
  entryMatchesReleaseFilter,
  pageMatchesReleaseFilter,
  releaseMembershipDiff,
  resolveReleaseFilterValue,
} from '#shared/utils/release'

describe('entryMatchesReleaseFilter', () => {
  it('admits everything under All, labelled or not', () => {
    expect(entryMatchesReleaseFilter([1], 'all')).toBe(true)
    expect(entryMatchesReleaseFilter([], 'all')).toBe(true)
    expect(entryMatchesReleaseFilter(undefined, 'all')).toBe(true)
  })

  it('reads Unassigned as "no labels at all"', () => {
    expect(entryMatchesReleaseFilter([], 'unassigned')).toBe(true)
    expect(entryMatchesReleaseFilter(undefined, 'unassigned')).toBe(true)
    expect(entryMatchesReleaseFilter([1], 'unassigned')).toBe(false)
  })

  it('matches one label among several', () => {
    expect(entryMatchesReleaseFilter([1, 2], 2)).toBe(true)
    expect(entryMatchesReleaseFilter([1, 2], 3)).toBe(false)
  })

  it('compares ids by value, not by type', () => {
    // Ids reach the client as strings from JSON and as numbers from the store.
    expect(entryMatchesReleaseFilter(['7'], 7)).toBe(true)
    expect(entryMatchesReleaseFilter([7], 7)).toBe(true)
    // A string comparison by substring would wrongly match "17" here.
    expect(entryMatchesReleaseFilter(['17'], 7)).toBe(false)
  })
})

describe('pageMatchesReleaseFilter', () => {
  it('reads the page labels', () => {
    expect(pageMatchesReleaseFilter({ releaseIds: [4] } as IPage, 4)).toBe(true)
    expect(pageMatchesReleaseFilter({ releaseIds: [] } as IPage, 4)).toBe(false)
  })

  it('treats a page with no releaseIds key as unlabelled', () => {
    expect(pageMatchesReleaseFilter({} as IPage, 'unassigned')).toBe(true)
    expect(pageMatchesReleaseFilter({} as IPage, 4)).toBe(false)
  })
})

describe('defaultReleaseIdForFilter', () => {
  it('defaults new content to the release being viewed', () => {
    expect(defaultReleaseIdForFilter(9)).toBe(9)
  })

  it('defaults to no label under All or Unassigned', () => {
    expect(defaultReleaseIdForFilter('all')).toBeUndefined()
    expect(defaultReleaseIdForFilter('unassigned')).toBeUndefined()
  })
})

describe('resolveReleaseFilterValue', () => {
  const releases = [{ id: 4, name: 'v1', sort: 1 }]

  it('keeps a label that still exists', () => {
    expect(resolveReleaseFilterValue(4, releases)).toBe(4)
  })

  it('falls back to All when the label was deleted', () => {
    // Otherwise every list would come up empty with nothing explaining why.
    expect(resolveReleaseFilterValue(9, releases)).toBe('all')
    expect(resolveReleaseFilterValue(4, [])).toBe('all')
    expect(resolveReleaseFilterValue(4, undefined)).toBe('all')
  })

  it('passes the non-label states through', () => {
    expect(resolveReleaseFilterValue('all', releases)).toBe('all')
    expect(resolveReleaseFilterValue('unassigned', releases)).toBe('unassigned')
  })
})

describe('releaseMembershipDiff', () => {
  it('asks for nothing when the set did not move', () => {
    expect(releaseMembershipDiff([1, 2], [1, 2])).toEqual({
      add: [],
      remove: [],
    })
    expect(releaseMembershipDiff([], [])).toEqual({ add: [], remove: [] })
  })

  it('adds what the row did not carry', () => {
    expect(releaseMembershipDiff([1], [1, 3])).toEqual({ add: [3], remove: [] })
  })

  it('removes what the row no longer should carry', () => {
    expect(releaseMembershipDiff([1, 3], [1])).toEqual({
      add: [],
      remove: [3],
    })
  })

  it('reports both directions at once', () => {
    expect(releaseMembershipDiff([1, 2], [2, 3])).toEqual({
      add: [3],
      remove: [1],
    })
  })

  it('compares across the id types the row and the picker carry', () => {
    // Row ids arrive from JSON as numbers while `ID` also allows strings.
    expect(releaseMembershipDiff(['1', '2'], [2, 3])).toEqual({
      add: [3],
      remove: [1],
    })
  })

  it('collapses duplicates instead of asking twice', () => {
    expect(releaseMembershipDiff([1, 1], [1, 3, 3])).toEqual({
      add: [3],
      remove: [],
    })
  })
})