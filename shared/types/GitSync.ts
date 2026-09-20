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
