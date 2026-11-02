import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import {
  DEFAULT_BACKUP_KEEP,
  runBackup,
  sqliteFilePath,
} from '../server/libs/backup'

/**
 * One backup right now, with the same settings as the daily schedule. For
 * checking a freshly mounted share without waiting for `NUXT_BACKUP_TIME`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadEnv({ path: join(repoRoot, '.env') })

const backupDir = process.env.NUXT_BACKUP_DIR?.trim()
if (!backupDir) {
  console.error('NUXT_BACKUP_DIR is not set.')
  process.exit(1)
}

try {
  const result = runBackup({
    dbPath: sqliteFilePath(
      process.env.DATABASE_URL || 'file:./runtime/db/dev.db',
      repoRoot
    ),
    uploadsDir:
      process.env.NUXT_LOCAL_OSS_DIR || resolve(repoRoot, 'runtime/uploads'),
    backupDir,
    keep: Number(process.env.NUXT_BACKUP_KEEP) || DEFAULT_BACKUP_KEEP,
  })
  console.log(
    `Wrote ${join(backupDir, result.name)}` +
      (result.pruned.length ? `, removed ${result.pruned.join(', ')}` : '')
  )
} catch (error) {
  console.error('Backup failed:', (error as Error).message)
  process.exit(1)
}
