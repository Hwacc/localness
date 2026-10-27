import type { ID } from '.'
import type {
  GitSyncLogAction,
  GitSyncLogStatus,
  GitSyncPushReason,
} from '../constants'
import type { IUser } from './User'

/**
 * How a three-way merge resolved one key. Lives here rather than beside the
 * merge so the client can name it too — `app/` may not import from `#server`.
 */
export type ThreeWayDecision = 'apply-theirs' | 'keep-ours' | 'conflict' | 'align'

/** An open three-way conflict, as the Git page's resolver reads it. */
export interface IGitSyncConflictRow {
  id: number
  key: string
  locale: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
  /** Git's text translates this older source; Use Git lands it outdated. */
  olderSourceText: string | null
}

/** One row of the Git review list, whichever mode it is showing. */
export interface IGitReviewItem {
  id: string
  key: string
  locale: string | null
  /** Text shown under the key: Git's side for pull, published for push. */
  text: string
  label: string
  color: 'primary' | 'neutral' | 'warning'
  /** Conflict rows and rows Push would skip are never ticked. */
  selectable: boolean
  /** An open three-way conflict, resolved in the detail pane. */
  conflict: boolean
  staleSource?: boolean
}

/** One side of a row, as the detail pane compares them. */
export interface IGitReviewSection {
  label: string
  text: string
  /** One plain-language line saying what this text is and why it is shown. */
  hint?: string
  /** Comparison only, not a choice: hidden until "Compare" is switched on. */
  optional?: boolean
  /** Which side this is, so the sides read apart at a glance. */
  tone: 'git' | 'platform' | 'reference' | 'warning'
}

export interface GitSyncBindingPublic {
  id: number
  enabled: boolean
  adapter: string
  remoteUrl: string
  branch: string
  product: string
  options: { pattern?: string; format?: string } | null
  credentialKind: string
  tokenConfigured: boolean
  lastPulledAt: string | null
  lastPushedAt: string | null
}

export interface GitSyncStatus {
  role: string
  isSteward: boolean
  configured: boolean
  binding: GitSyncBindingPublic | null
  openConflicts: number
}

export interface PullFile {
  relPath: string
  sha: string
  locale: string | null
  remoteLocale: string
  date: string
  reason: string
}

export interface PullCandidate {
  key: string
  locale: string
  relPath?: string
  baseText: string
  oursText: string
  theirsText: string
  publishedText: string | null
  decision: ThreeWayDecision
  /** Source text of the batch this translation came from, when known. */
  writtenAgainst?: string | null
  /** Translated from an older source; a newer batch is still out. */
  staleSource?: boolean
}

export interface PullPreview {
  previewId: number
  commitSha: string
  expiresAt: string
  files: PullFile[]
  candidates: PullCandidate[]
  counts: Record<ThreeWayDecision, number>
  /** Locales present in Git that the project does not have; never pulled. */
  ignoredLocales: string[]
}

export interface PullApplyResult {
  applied: number
  aligned: number
  kept: number
  /** Edited on the platform after the preview, so left as they are. */
  changed: { key: string; locale: string }[]
  files: number
}

export interface PushCandidate {
  key: string
  baseText: string
  text: string
  theirsText: string
  reason: string
  eligible: boolean
}

export interface PushPreview {
  previewId: number
  sourceLocale: string
  expiresAt: string
  candidates: PushCandidate[]
  counts: Record<string, number>
}

/** Summary of a landed pull. Counts only — text stays in the value tables. */
export interface IGitSyncPullLogDetail {
  applied: number
  aligned: number
  kept: number
  files: number
}

/** Summary of a push attempt. `keys` are key names, never their text. */
export interface IGitSyncPushLogDetail {
  filename: string
  count: number
  keys: string[]
  reconciled: boolean
  /** How many keys each reason dropped, e.g. `{ unchanged: 3 }`. */
  skipped: Partial<Record<GitSyncPushReason, number>>
  conflicts: number
}

export interface IGitSyncConflictLogDetail {
  key: string
  locale: string
  action: 'ours' | 'theirs' | 'merged' | 'renamed'
}

export type IGitSyncLogDetail =
  | IGitSyncPullLogDetail
  | IGitSyncPushLogDetail
  | IGitSyncConflictLogDetail

export interface IGitSyncLog {
  id: ID
  createdAt: string
  action: GitSyncLogAction
  status: GitSyncLogStatus
  previewId: number | null
  commitSha: string
  detail: IGitSyncLogDetail | null
  user: Pick<IUser, 'username' | 'nickname' | 'avatar'> | null
}

/** Cursor page of history rows. `nextCursor` is the last row id, or null. */
export interface IGitSyncLogPage {
  rows: IGitSyncLog[]
  nextCursor: number | null
}
