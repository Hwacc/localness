/**
 * Response shapes of the write half of the public `/api/v1` API. They live in
 * `shared` for the same reason `Delivery.ts` does: callers outside this repo
 * (the design-tool plugin) type against them, so changing a field here is a
 * breaking change for those callers.
 *
 * Deliberately not the editor's `ITag`: no translation payload, no settings, no
 * release labels. An importer draws rectangles and binds keys; everything else
 * about a tag belongs to the editor.
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