import type { ID } from '../types'
import type { IPage } from '../types/Page'
import type { IProjectRelease } from '../types/Project'

/**
 * Which release the workspace is looking at. `'all'` is unfiltered,
 * `'unassigned'` is the entries carrying no label at all, and a number is one
 * release's id.
 *
 * Lives in `shared/` because the same three states exist on both sides: the
 * server keeps them in `release.ts` (`ReleaseFilter` / `parseReleaseFilter` /
 * `releaseWhereFragment`), and these are the client's twins for matching rows it
 * already has in memory.
 */
export type ReleaseFilterValue = 'all' | 'unassigned' | number

/** Whether an entry's labels put it in the filtered release. */
export function entryMatchesReleaseFilter(
  releaseIds: ID[] | undefined,
  filter: ReleaseFilterValue
) {
  if (filter === 'all') return true
  const ids = releaseIds ?? []
  if (filter === 'unassigned') return ids.length === 0
  return ids.some((releaseId) => String(releaseId) === String(filter))
}

/**
 * Whether a page belongs to the release the workspace is viewing.
 *
 * The editor sider and the store's `pageList` must agree on this, which is why
 * it lives here rather than inline in one of them.
 */
export function pageMatchesReleaseFilter(
  page: IPage,
  filter: ReleaseFilterValue
) {
  return entryMatchesReleaseFilter(page.releaseIds, filter)
}

/** The label a new page or translation should default to, if any. */
export function defaultReleaseIdForFilter(
  filter: ReleaseFilterValue
): number | undefined {
  return typeof filter === 'number' ? filter : undefined
}

/** Display name of a filter, for buttons and empty states. */
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

/**
 * A remembered label can be deleted between sessions, and a filter pointing at
 * nothing would empty every list with no explanation. That reads as All.
 */
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