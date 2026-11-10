import type { ID } from '../types'

export type ProjectLinkResolution<T> =
  | { kind: 'none' }
  | { kind: 'stay' }
  | { kind: 'switch'; project: T }
  | { kind: 'unavailable'; requested: string }

/**
 * What a `?project=` deep link asks of the page. `projects` is the list this
 * user can see, so an id outside it — invalid, deleted, or another Team's —
 * is "unavailable" and the page stays where it is.
 */
export function resolveProjectLink<T extends { id: ID }>(
  param: unknown,
  projects: readonly T[],
  currentId: ID | null | undefined
): ProjectLinkResolution<T> {
  const raw = Array.isArray(param) ? param[0] : param
  if (typeof raw !== 'string' || !raw.trim()) return { kind: 'none' }
  const requested = raw.trim()
  if (currentId != null && String(currentId) === requested) {
    return { kind: 'stay' }
  }
  const project = projects.find((p) => String(p.id) === requested)
  return project
    ? { kind: 'switch', project }
    : { kind: 'unavailable', requested }
}
