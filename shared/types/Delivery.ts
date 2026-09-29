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
  /** ISO 8601. */
  generatedAt: string
}
