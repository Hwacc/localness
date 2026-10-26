import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'

/**
 * A backup directory is only trusted once someone has put this file in it. A
 * network share that failed to mount leaves an empty directory behind, and
 * writing into that "succeeds" onto the host's own disk — the one place the
 * backup must not be.
 */
export const BACKUP_MARKER = '.localness-backup'

const BACKUP_NAME = /^localness-\d{8}-\d{6}$/
const STAGING_PREFIX = '.partial-'

export const DEFAULT_BACKUP_TIME = '03:00'
export const DEFAULT_BACKUP_KEEP = 3

export interface BackupOptions {
  dbPath: string
  /** Skipped when it does not exist, e.g. uploads live in object storage. */
  uploadsDir: string
  backupDir: string
  keep: number
  now?: Date
}

export interface BackupResult {
  name: string
  pruned: string[]
}

/** `file:/app/runtime/db/localness.db` → an absolute path. */
export function sqliteFilePath(url: string, cwd = process.cwd()) {
  const path = url.replace(/^file:/, '')
  return isAbsolute(path) ? path : resolve(cwd, path)
}

export function parseBackupTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

/** The next local `hour:minute` strictly after `now`. */
export function nextRunAt(
  now: Date,
  time: { hour: number; minute: number }
) {
  const next = new Date(now)
  next.setHours(time.hour, time.minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** Sorts as time order, so retention needs no date parsing. */
export function backupName(date: Date) {
  return (
    `localness-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/** Names to delete: everything but the newest `keep`. */
export function backupsToPrune(names: string[], keep: number) {
  return names
    .filter((name) => BACKUP_NAME.test(name))
    .sort()
    .reverse()
    .slice(Math.max(keep, 1))
}

/** Throws a message an operator can act on. */
export function assertBackupTarget(backupDir: string) {
  if (!existsSync(backupDir) || !statSync(backupDir).isDirectory()) {
    throw new Error(`backup directory ${backupDir} does not exist`)
  }
  if (!existsSync(join(backupDir, BACKUP_MARKER))) {
    throw new Error(
      `${backupDir} has no ${BACKUP_MARKER} file. Is the share mounted? If it is, create the file once to confirm this is the right place.`
    )
  }
}

/**
 * One snapshot: `localness-YYYYMMDD-HHmmss/{localness.db, uploads/}`.
 *
 * The database is snapshotted with `VACUUM INTO` into a local temp file first
 * and only then copied out: SQLite locking on a network share is unreliable,
 * and a plain file copy of a live database is not consistent. The snapshot is
 * verified before it leaves the machine, and the folder only gets its final
 * name once everything is in it, so a half-written backup is never mistaken
 * for a good one.
 */
export function runBackup(options: BackupOptions): BackupResult {
  const { dbPath, uploadsDir, backupDir, keep } = options
  assertBackupTarget(backupDir)

  const name = backupName(options.now ?? new Date())
  const finalDir = join(backupDir, name)
  if (existsSync(finalDir)) throw new Error(`${finalDir} already exists`)

  const work = mkdtempSync(join(tmpdir(), 'localness-backup-'))
  const stagingDir = join(backupDir, `${STAGING_PREFIX}${name}`)
  try {
    const snapshot = join(work, 'localness.db')
    const source = new Database(dbPath, { readonly: true })
    try {
      source.exec(
        `VACUUM INTO '${snapshot.split(sep).join('/').replaceAll("'", "''")}'`
      )
    } finally {
      source.close()
    }

    const copy = new Database(snapshot, { readonly: true })
    try {
      const rows = copy.pragma('integrity_check') as {
        integrity_check: string
      }[]
      const verdict = rows.map((row) => row.integrity_check).join('; ')
      if (verdict !== 'ok') throw new Error(`integrity_check: ${verdict}`)
    } finally {
      copy.close()
    }

    rmSync(stagingDir, { recursive: true, force: true })
    mkdirSync(stagingDir)
    copyFileSync(snapshot, join(stagingDir, 'localness.db'))
    if (existsSync(uploadsDir)) {
      cpSync(uploadsDir, join(stagingDir, 'uploads'), { recursive: true })
    }
    renameSync(stagingDir, finalDir)
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  const entries = readdirSync(backupDir)
  const pruned = backupsToPrune(entries, keep)
  for (const old of pruned) {
    rmSync(join(backupDir, old), { recursive: true, force: true })
  }
  // A crash between mkdir and rename leaves one behind; the next success sweeps it.
  for (const entry of entries) {
    if (entry.startsWith(STAGING_PREFIX)) {
      rmSync(join(backupDir, entry), { recursive: true, force: true })
    }
  }
  return { name, pruned }
}
