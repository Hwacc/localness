import { resolve } from 'node:path'
import {
  assertBackupTarget,
  DEFAULT_BACKUP_KEEP,
  DEFAULT_BACKUP_TIME,
  nextRunAt,
  parseBackupTime,
  runBackup,
  sqliteFilePath,
} from '#server/libs/backup'

/**
 * Daily snapshot of the database and local uploads into `NUXT_BACKUP_DIR`.
 * Off unless that variable is set. Time is the container's local time, so set
 * `TZ`; `NUXT_BACKUP_TIME` (HH:MM, default 03:00) and `NUXT_BACKUP_KEEP`
 * (default 3) tune it. Never blocks boot: a failed backup is a log line, not an
 * outage, and the next day tries again.
 */
export default defineNitroPlugin(() => {
  const backupDir = process.env.NUXT_BACKUP_DIR?.trim()
  if (!backupDir) return

  const time = parseBackupTime(
    process.env.NUXT_BACKUP_TIME || DEFAULT_BACKUP_TIME
  )
  if (!time) {
    console.warn(
      `[backup] NUXT_BACKUP_TIME "${process.env.NUXT_BACKUP_TIME}" is not HH:MM. Backups are off.`
    )
    return
  }
  const keep = Number(process.env.NUXT_BACKUP_KEEP) || DEFAULT_BACKUP_KEEP

  // Surface a bad mount at boot, not at 03:00.
  try {
    assertBackupTarget(backupDir)
  } catch (error) {
    console.warn(`[backup] ${(error as Error).message}`)
  }

  const schedule = (from = new Date()) => {
    const at = nextRunAt(from, time)
    console.log(`[backup] next run ${at.toString()} -> ${backupDir}`)
    setTimeout(run, at.getTime() - Date.now()).unref()
  }

  const run = () => {
    try {
      const result = runBackup({
        dbPath: sqliteFilePath(process.env.DATABASE_URL || 'file:./dev.db'),
        uploadsDir:
          process.env.NUXT_LOCAL_OSS_DIR ||
          resolve(process.cwd(), 'runtime/uploads'),
        backupDir,
        keep,
      })
      console.log(
        `[backup] wrote ${result.name}` +
          (result.pruned.length ? `, removed ${result.pruned.join(', ')}` : '')
      )
    } catch (error) {
      console.error('[backup] FAILED:', error)
    } finally {
      // A timer can fire a few ms early; looking past the minute keeps it from re-arming for the same slot.
      schedule(new Date(Date.now() + 60_000))
    }
  }

  schedule()
})
