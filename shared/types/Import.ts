/**
 * Response shapes of the write half of the public `/api/v1` API, plus the
 * authoring reads a design tool needs. They live in `shared` for the same
 * reason `Delivery.ts` does: callers outside this repo (the design-tool plugin)
 * type against them, so changing a field here is a breaking change for those
 * callers. New fields are additions.
 *
 * `Delivery` stays published copy. These shapes are how the plugin sees drafts.
 */

/** One rectangle as the import API sees it. */
export interface ImportedTag {
  id: number
  /** The design-tool node it was drawn from; null for tags drawn by hand. */
  figmaNodeId: string | null
  x: number
  y: number
  width: number
  height: number
  i18nKey: string | null
  i18nKeyId: number | null
}

/** `POST /api/v1/uploads` */
export interface UploadResult {
  key: string
}

/** `POST /api/v1/pages` */
export interface CreatePageResult {
  id: number
  name: string
  image: string | null
  tags: ImportedTag[]
}

/**
 * `PATCH /api/v1/pages/:id`. `stale` are tags whose node was not in the request
 * — reported, never deleted; the caller decides. Deleting them is a separate,
 * explicit call.
 */
export interface ImportPageResult {
  pageId: number
  name: string
  image: string | null
  created: number
  updated: number
  stale: ImportedTag[]
  tags: ImportedTag[]
}

/** `GET /api/v1/pages/:id/tags` */
export interface ImportPageTags {
  pageId: number
  tags: ImportedTag[]
}

/**
 * `POST /api/v1/pages/:id/tags/delete`. `ignored` counts ids that were not tags
 * of this page, so a caller that mixed up ids can see it rather than guess.
 */
export interface DeleteTagsResult {
  deleted: number
  ignored: number
}

/** A key the authoring picker and the text match can both return. Drafts included. */
export interface AuthorKeyHit {
  id: number
  key: string
  /** Source-language text: the draft when one exists, otherwise the published text. */
  sourceText: string
  /** The source language has no published text yet. */
  draft: boolean
  releaseIds: number[]
}

/** `GET /api/v1/keys/search` */
export interface AuthorKeySearch {
  keys: AuthorKeyHit[]
  total: number
}

/** `POST /api/v1/match`. One entry per submitted text, in the same order. */
export interface AuthorMatch {
  matches: Array<{ text: string; keys: AuthorKeyHit[] }>
}

/**
 * `GET /api/v1/pages/:id`. The page as an author sees it: draft source text and
 * the release labels on the page and on each tag's key. A tag has no labels of
 * its own — `releaseIds` are the bound key's.
 */
export interface AuthorTag extends ImportedTag {
  draftText: string | null
  publishedText: string | null
  releaseIds: number[]
}

export interface AuthorPage {
  pageId: number
  name: string
  image: string | null
  releaseIds: number[]
  tags: AuthorTag[]
}