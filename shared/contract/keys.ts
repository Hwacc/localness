import { z } from 'zod/v4'
import { deliveryKeyStateSchema } from './delivery'

/**
 * Response shapes of the key write routes an IDE plugin uses: create a key from
 * text in code, name it, and edit its drafts. Same versioning rule as
 * `delivery.ts`. A key created with a name publishes its source text; every
 * other write lands in drafts, and publishing stays in the web app.
 */

/**
 * `POST /api/v1/keys` and `PATCH /api/v1/keys`. The key comes back in the
 * `/keys/states` shape, so a plugin can drop it straight into that cache.
 */
export const keyWriteResultSchema = z.object({
  sourceLocale: z.string(),
  /**
   * False when the request named no key and the text already has its
   * `__unnamed_` key — the same text maps to the same placeholder. Always false
   * for `PATCH`.
   */
  created: z.boolean(),
  key: deliveryKeyStateSchema,
})
export type KeyWriteResult = z.infer<typeof keyWriteResultSchema>

/**
 * The `data` of a `PATCH /api/v1/keys` 409: a locale's draft no longer matches
 * the `expected` the client sent. Nothing was written; `key` is the current
 * state to diff against before retrying.
 */
export const keyDraftConflictSchema = z.object({
  locales: z.array(z.string()),
  key: deliveryKeyStateSchema,
})
export type KeyDraftConflict = z.infer<typeof keyDraftConflictSchema>

export const keyViolationSchema = z.enum([
  'prefix',
  'charset',
  'segment',
  'case',
  'depth',
])

/**
 * `POST /api/v1/keys/suggest-name` — the web app's AI key naming, under the
 * project's key convention. `key` is empty when the text has nothing nameable.
 */
export const keyNameSuggestionSchema = z.object({
  source: z.string(),
  key: z.string(),
  confidence: z.number().optional(),
  alternatives: z
    .array(z.object({ key: z.string(), confidence: z.number().optional() }))
    .optional(),
  reason: z.string().optional(),
  violations: z.array(keyViolationSchema),
  /** Candidates the project already has; `sameSourceText` means reuse, not clash. */
  duplicates: z.array(
    z.object({
      key: z.string(),
      sourceText: z.string(),
      sameSourceText: z.boolean(),
    }),
  ),
})
export type KeyNameSuggestion = z.infer<typeof keyNameSuggestionSchema>

/**
 * `GET /api/v1/key-convention` — the project's key naming rules, so a client
 * can name keys itself instead of calling `suggest-name` once per text.
 * `prefix` is without its trailing separator; `''` means no prefix.
 */
export const keyConventionSchema = z.object({
  prefix: z.string(),
  separator: z.string(),
  style: z.enum(['snake_case', 'camelCase']),
  maxDepth: z.number(),
  /** The project's naming guidance for the AI, or null when unset. */
  prompt: z.string().nullable(),
})
export type KeyConventionInfo = z.infer<typeof keyConventionSchema>
