import type { ID } from '.'
import type { ITagSetting } from './Tag'
import type { KeyViolation } from '../utils/key-convention'
import type { InterpolationStyle } from '../utils/i18n-import'

export interface ILocaleValue {
  locale: string
  draftText: string | null
  publishedText: string | null
  /** Source fingerprint this translation was written against. Empty on the source locale. */
  sourceFingerprint?: string
}

export interface II18nKeyRow {
  id: ID
  key: string
  description: string | null
  updatedAt: Date | string
  tagCount: number
  dirty: boolean
  /** Fingerprint of the current source sentence. */
  fingerprint?: string
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

export type I18nImportSkipReason = 'no-source-text' | 'reserved-prefix' | 'empty-key'

export type I18nImportRowKind = 'new' | 'same' | 'changed'

export interface II18nImportChange {
  locale: string
  /** What the project holds now: published text, else the draft. */
  before: string | null
  after: string
}

export interface II18nImportRow {
  key: string
  kind: I18nImportRowKind
  /** Incoming text per project locale. */
  texts: Record<string, string>
  /** Only on `changed`: the locales an overwrite would rewrite. */
  changes: II18nImportChange[]
  /** An existing key with unpublished edits, which an overwrite replaces. */
  hasUnpublishedDraft: boolean
  /** Reported, never enforced: an imported key is already in someone's code. */
  violations: KeyViolation[]
}

/** Shared by preview and apply, so what the user reviewed is what gets written. */
export interface II18nImportPreview {
  sourceLocale: string
  rows: II18nImportRow[]
  skipped: Array<{ key: string; reason: I18nImportSkipReason }>
  /** Locales in the payload the project does not configure. */
  ignoredLocales: string[]
  counts: Record<I18nImportRowKind | 'skipped', number>
  /** More than one means the file mixes placeholder syntaxes. */
  interpolationStyles: InterpolationStyle[]
}

export interface II18nImportResult {
  created: number
  updated: number
  unchanged: number
  skipped: number
  /** Keys newly attached to the chosen release. */
  releaseLinked: number
}
