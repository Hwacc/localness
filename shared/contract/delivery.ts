import { z } from 'zod/v4'
import { projectReleaseSchema } from './release'

/**
 * Response shapes of the public `/api/v1` delivery API. Callers outside the
 * Localness repo (the design-tool plugin, build tooling) validate against
 * these, so changing a field is a breaking change for them: a removed or
 * retyped field is a major version, a new optional field is a minor one.
 */

/** Published copy only: `{ locale: { key: text } }`, the map the JSON export uses. */
export const deliveryBundleSchema = z.record(
  z.string(),
  z.record(z.string(), z.string())
)
export type DeliveryBundle = z.infer<typeof deliveryBundleSchema>

/** `GET /api/v1/locales/:locale` — `{ key: text }` for one locale. */
export const deliveryLocaleSchema = z.record(z.string(), z.string())
export type DeliveryLocale = z.infer<typeof deliveryLocaleSchema>

/** `GET /api/v1/outdated` — locales whose published translation lags the source sentence. */
export const deliveryOutdatedSchema = z.object({
  /** locale → keys */
  outdated: z.record(z.string(), z.array(z.string())),
})
export type DeliveryOutdated = z.infer<typeof deliveryOutdatedSchema>

/** `GET /api/v1/meta` — what a caller holding only a token learns first. */
export const deliveryMetaSchema = z.object({
  project: z.object({ id: z.number(), name: z.string() }),
  locales: z.array(z.string()),
  localeFallback: z.string(),
  /** The release the response is scoped to, or null for all keys. */
  release: z.number().nullable(),
  /** The names `?release=` accepts, which a caller cannot otherwise discover. */
  releases: z.array(projectReleaseSchema),
  coverage: z.object({
    keys: z.number(),
    projectKeys: z.number(),
    publishedPerLocale: z.record(z.string(), z.number()),
  }),
  /**
   * Whether this token's owner may define release labels on the project.
   * Attaching a label to a page or a key is separate, and does not need this.
   */
  canManageReleases: z.boolean(),
  /**
   * Instance-level facts. Seed of capability negotiation: `plus` gates
   * features, `version` lets a caller adapt. Never carries the customer or the
   * expiry date.
   */
  instance: z.object({ version: z.string(), plus: z.boolean() }).optional(),
  /** ISO 8601. */
  generatedAt: z.string(),
})
export type DeliveryMeta = z.infer<typeof deliveryMetaSchema>

/** One project a token may address. */
export const deliveryProjectRefSchema = z.object({
  id: z.number(),
  name: z.string(),
})
export type DeliveryProjectRef = z.infer<typeof deliveryProjectRefSchema>

/**
 * `GET /api/v1/projects` — which projects this credential can address *now*.
 *
 * A token belongs to a person and may name several projects, so this is the
 * discovery step when the credential itself cannot answer "which one": it is
 * also the list `?project=` accepts. Projects whose team the owner has left are
 * absent, so an empty list means the credential is spent.
 */
export const deliveryProjectsSchema = z.object({
  projects: z.array(deliveryProjectRefSchema),
  /** ISO 8601. */
  generatedAt: z.string(),
})
export type DeliveryProjects = z.infer<typeof deliveryProjectsSchema>

/**
 * `GET /api/v1/keys` — names only; text is `/bundle`'s job. Load-bearing as a
 * superset of that bundle's keys: omitting one there breaks a tie silently.
 */
export const deliveryKeysSchema = z.object({
  keys: z.array(z.string()),
  /** ISO 8601. */
  generatedAt: z.string(),
})
export type DeliveryKeys = z.infer<typeof deliveryKeysSchema>
