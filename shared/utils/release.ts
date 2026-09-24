import type { ID } from '../types'
import type { IPage } from '../types/Page'
import type { IProjectRelease } from '../types/Project'

/**
 * Which release the workspace is looking at: `'all'`, `'unassigned'`, or one
 * release's id. The client twin of the server's `ReleaseFilter`.
 */
export type ReleaseFilterValue = 'all' | 'unassigned' | number

export function entryMatchesReleaseFilter(
  releaseIds: ID[] | undefined,
  filter: ReleaseFilterValue
) {
  if (filter === 'all') return true
  const ids = releaseIds ?? []
  if (filter === 'unassigned') return ids.length === 0
  return ids.some((releaseId) => String(releaseId) === String(filter))
}

export function pageMatchesReleaseFilter(
  page: IPage,
  filter: ReleaseFilterValue
) {
  return entryMatchesReleaseFilter(page.releaseIds, filter)
}

export function defaultReleaseIdForFilter(
  filter: ReleaseFilterValue
): number | undefined {
  return typeof filter === 'number' ? filter : undefined
}

export function releaseFilterLabel(
  filter: ReleaseFilterValue,
  releases: IProjectRelease[] | undefined
): string {
  if (filter === 'all') return 'All releases'
  if (filter === 'unassigned') return 'Unassigned'
  return (
    (releases ?? []).find(
      (release) => String(release.id) === String(filter)
    )?.name ?? 'Release'
  )
}

/** `All` is not a release, so an export of everything carries no release name. */
export function releaseNameForExport(
  filter: ReleaseFilterValue,
  releases: IProjectRelease[] | undefined
): string | null {
  return filter === 'all' ? null : releaseFilterLabel(filter, releases)
}

/** Parses a stored value: anything unreadable falls back to All. */
export function resolveReleaseFilterValue(
  stored: ReleaseFilterValue,
  releases: IProjectRelease[] | undefined
): ReleaseFilterValue {
  if (typeof stored !== 'number') return stored
  const exists = (releases ?? []).some(
    (release) => String(release.id) === String(stored)
  )
  return exists ? stored : 'all'
}

/**
 * The two sets of single-label calls that turn `current` into `next`. The
 * membership endpoint is a per-release set operation, so a whole-set change has
 * to be spelled as one add or remove each; ids are compared as numbers because
 * a row's ids come back from JSON while the picker emits numbers.
 */
export function releaseMembershipDiff(
  current: ID[],
  next: number[]
): { add: number[]; remove: number[] } {
  const currentIds = new Set(current.map(Number))
  const nextIds = new Set(next.map(Number))
  return {
    add: [...nextIds].filter((id) => !currentIds.has(id)),
    remove: [...currentIds].filter((id) => !nextIds.has(id)),
  }
}