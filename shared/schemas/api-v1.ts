import { z } from 'zod/v4'
import { zNilable } from './common'

/**
 * Request bodies of the public `/api/v1` write API. The matching response
 * shapes live in `shared/contract`.
 *
 * Bound on one import. A frame's text layers fit comfortably; the cap is there
 * so one request cannot hold SQLite's single writer for an unbounded time.
 */
export const API_V1_MAX_TAGS = 500

/**
 * A rectangle an importer draws for one node. Deliberately narrower than `zTag`:
 * no `className` (the server writes the same constant the editor does), no
 * `settings`, no `releaseIds` — none of those are an importer's business, and
 * `zPage`'s mandatory settings blob is a form artifact rather than a contract.
 * `i18nKey` binds a key that already exists; an unknown name stays unbound.
 * `keyName` is a new key to create; `sourceText` lands as its source language,
 * draft and published (Capture publishes the wording from the design).
 */
export const zApiV1Tag = z.object({
  figmaNodeId: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  i18nKey: zNilable(z.string()),
  /** Present only when this layer should create a new key. */
  keyName: z.string().trim().max(200).optional(),
  /** The layer's wording. Written as the bound key's source text, draft and published. */
  sourceText: z.string().optional(),
  /**
   * Append `releaseId` from the page request onto this key. Absent means the
   * key's labels stay as they are — a checked layer is not itself a label.
   */
  labelRelease: z.boolean().optional(),
})
export type ZApiV1Tag = z.infer<typeof zApiV1Tag>

export const zApiV1PageCreate = z.object({
  name: z.string().trim().min(1).max(200),
  image: z.string().min(1),
  tags: z.array(zApiV1Tag).max(API_V1_MAX_TAGS).default([]),
  /**
   * When set, the new page is labelled with it. A key is labelled only when its
   * tag sets `labelRelease`. Omitted means no label. Never removes a label.
   */
  releaseId: z.number().int().positive().optional(),
})
export type ZApiV1PageCreate = z.infer<typeof zApiV1PageCreate>

/** Every field optional: an absent one is left alone, an absent `tags` is a no-op. */
export const zApiV1PageUpdate = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  image: z.string().min(1).optional(),
  tags: z.array(zApiV1Tag).max(API_V1_MAX_TAGS).optional(),
  /**
   * Appends this label to the page. Keys are labelled only when their tag sets
   * `labelRelease`. Labels already on a key are not removed.
   */
  releaseId: z.number().int().positive().optional(),
})
export type ZApiV1PageUpdate = z.infer<typeof zApiV1PageUpdate>

/** Tags an importer decided are gone from the design. Only ever explicit ids. */
export const zApiV1TagDelete = z.object({
  tagIds: z.array(z.number().int().positive()).min(1).max(API_V1_MAX_TAGS),
})
export type ZApiV1TagDelete = z.infer<typeof zApiV1TagDelete>

/** `POST /api/v1/match`. The texts are layer wordings, not key names. */
export const zApiV1Match = z.object({
  texts: z.array(z.string()).max(API_V1_MAX_TAGS),
})
export type ZApiV1Match = z.infer<typeof zApiV1Match>
