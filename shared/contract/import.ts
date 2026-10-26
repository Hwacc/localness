import { z } from 'zod/v4'

/**
 * Response shapes of the write half of the public `/api/v1` API, plus the
 * capture reads a design tool needs. Same versioning rule as `delivery.ts`:
 * new fields are additions, removing or retyping one is a major version.
 *
 * `delivery` stays published copy. These shapes are how a plugin sees drafts.
 */

/** One rectangle as the import API sees it. */
export const importedTagSchema = z.object({
  id: z.number(),
  /** The design-tool node it was drawn from; null for tags drawn by hand. */
  figmaNodeId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  i18nKey: z.string().nullable(),
  i18nKeyId: z.number().nullable(),
})
export type ImportedTag = z.infer<typeof importedTagSchema>

/** `POST /api/v1/uploads` */
export const uploadResultSchema = z.object({ key: z.string() })
export type UploadResult = z.infer<typeof uploadResultSchema>

/** `POST /api/v1/pages` */
export const createPageResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  image: z.string().nullable(),
  tags: z.array(importedTagSchema),
})
export type CreatePageResult = z.infer<typeof createPageResultSchema>

/**
 * `PATCH /api/v1/pages/:id`. `stale` are tags whose node was not in the request
 * — reported, never deleted; the caller decides. Deleting them is a separate,
 * explicit call.
 */
export const importPageResultSchema = z.object({
  pageId: z.number(),
  name: z.string(),
  image: z.string().nullable(),
  created: z.number(),
  updated: z.number(),
  stale: z.array(importedTagSchema),
  tags: z.array(importedTagSchema),
})
export type ImportPageResult = z.infer<typeof importPageResultSchema>

/** `GET /api/v1/pages/:id/tags` */
export const importPageTagsSchema = z.object({
  pageId: z.number(),
  tags: z.array(importedTagSchema),
})
export type ImportPageTags = z.infer<typeof importPageTagsSchema>

/**
 * `POST /api/v1/pages/:id/tags/delete`. `ignored` counts ids that were not tags
 * of this page, so a caller that mixed up ids can see it rather than guess.
 */
export const deleteTagsResultSchema = z.object({
  deleted: z.number(),
  ignored: z.number(),
})
export type DeleteTagsResult = z.infer<typeof deleteTagsResultSchema>

/** A key the capture picker and the text match can both return. Drafts included. */
export const captureKeyHitSchema = z.object({
  id: z.number(),
  key: z.string(),
  /** Source-language text: the draft when one exists, otherwise the published text. */
  sourceText: z.string(),
  /** The source language has no published text yet. */
  draft: z.boolean(),
  releaseIds: z.array(z.number()),
})
export type CaptureKeyHit = z.infer<typeof captureKeyHitSchema>

/** `GET /api/v1/keys/search` */
export const captureKeySearchSchema = z.object({
  keys: z.array(captureKeyHitSchema),
  total: z.number(),
})
export type CaptureKeySearch = z.infer<typeof captureKeySearchSchema>

/** `POST /api/v1/match`. One entry per submitted text, in the same order. */
export const captureMatchSchema = z.object({
  matches: z.array(
    z.object({ text: z.string(), keys: z.array(captureKeyHitSchema) })
  ),
})
export type CaptureMatch = z.infer<typeof captureMatchSchema>

/**
 * `GET /api/v1/pages/:id`. The page as capture sees it: draft source text and
 * the release labels on the page and on each tag's key. A tag has no labels of
 * its own — `releaseIds` are the bound key's.
 */
export const captureTagSchema = importedTagSchema.extend({
  draftText: z.string().nullable(),
  publishedText: z.string().nullable(),
  releaseIds: z.array(z.number()),
})
export type CaptureTag = z.infer<typeof captureTagSchema>

export const capturePageSchema = z.object({
  pageId: z.number(),
  projectId: z.number(),
  name: z.string(),
  image: z.string().nullable(),
  releaseIds: z.array(z.number()),
  tags: z.array(captureTagSchema),
})
export type CapturePage = z.infer<typeof capturePageSchema>
