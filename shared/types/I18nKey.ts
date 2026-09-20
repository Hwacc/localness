import type { ID } from '.'
import type { ITagSetting } from './Tag'

export interface ILocaleValue {
  locale: string
  draftText: string | null
  publishedText: string | null
}

export interface II18nKeyRow {
  id: ID
  key: string
  origin: string
  description: string | null
  updatedAt: Date | string
  tagCount: number
  dirty: boolean
  locales: ILocaleValue[]
  /** Release labels on this entry. Empty means Unassigned. */
  releaseIds?: ID[]
  /**
   * Whether the key takes part in Git sync, both directions. Independent of
   * `dirty`: a key is served on the published API either way.
   */
  gitSyncEnabled: boolean
}

export interface II18nKeyRefTag {
  id: ID
  x: number
  y: number
  width: number
  height: number
  settings?: ITagSetting | null
}

export interface II18nKeyRefPage {
  id: ID
  name: string
  image: string | null
  tags: II18nKeyRefTag[]
}

export interface II18nKeyRefs {
  key: string
  pages: II18nKeyRefPage[]
}

export type I18nTransferMode = 'copy' | 'move'

export type I18nTransferSkipReason = 'key-exists'

/**
 * What one copy/move batch did. Lives here rather than beside the server
 * helper because `app/` may not import from `#server`.
 */
export interface II18nTransferResult {
  mode: I18nTransferMode
  sourceProjectId: ID
  targetProjectId: ID
  copied: number
  /** Keys deleted from the source. Always 0 for a copy. */
  removed: number
  /** Refused by a rule — the target already has that key. */
  skipped: Array<{ key: string; reason: I18nTransferSkipReason }>
  /** The write threw; the batch carried on past it. */
  failed: Array<{ key: string }>
  /** Source key ids a move actually removed, for the client to drop local bindings. */
  movedIds: ID[]
}
