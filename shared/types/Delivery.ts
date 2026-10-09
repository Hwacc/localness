import type { IProjectRelease } from './Project'

/**
 * Response shapes of the public `/api/v1` delivery API. They live in `shared`
 * because callers outside this repo (the design-tool plugin) type against them,
 * so changing a field here is a breaking change for those callers.
 */

/** Published copy only: `{ locale: { key: text } }`, the map the JSON export uses. */
export type DeliveryBundle = Record<string, Record<string, string>>

/** `GET /api/v1/meta` — what a caller holding only a token learns first. */
export interface DeliveryMeta {
  project: { id: number; name: string }
  locales: string[]
  localeFallback: string
  /** The release the response is scoped to, or null for all keys. */
  release: number | null
  /** The names `?release=` accepts, which a caller cannot otherwise discover. */
  releases: IProjectRelease[]
  coverage: {
    keys: number
    projectKeys: number
    publishedPerLocale: Record<string, number>
  }
  /**
   * Whether this token's owner may define release labels on the project.
   * Attaching a label to a page or a key is separate, and does not need this.
   */
  canManageReleases: boolean
  /** ISO 8601. */
  generatedAt: string
}

/** One project a token may address. */
export interface DeliveryProjectRef {
  id: number
  name: string
}

/**
 * `GET /api/v1/projects` — which projects this credential can address *now*.
 *
 * A token belongs to a person and may name several projects, so this is the
 * discovery step when the credential itself cannot answer "which one": it is
 * also the list `?project=` accepts. Projects whose team the owner has left are
 * absent, so an empty list means the credential is spent.
 */
export interface DeliveryProjects {
  projects: DeliveryProjectRef[]
  /** ISO 8601. */
  generatedAt: string
}

/**
 * `GET /api/v1/keys` — names only; text is `/bundle`'s job. Load-bearing as a
 * superset of that bundle's keys: omitting one there breaks a tie silently.
 */
export interface DeliveryKeys {
  keys: string[]
  /** ISO 8601. */
  generatedAt: string
}
