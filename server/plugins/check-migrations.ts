import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import prisma from '#server/libs/prisma'

/**
 * Dev-only guard. The container applies migrations on every boot
 * (docker/entrypoint.sh), but `pnpm dev` does not — so pulling a branch that
 * adds one leaves the database a column short, and Prisma reports that as
 * `The column X does not exist in the current database` from whatever query
 * happens to touch the table first. That error never mentions migrations, so
 * say it here instead.
 *
 * Warns only. Applying migrations behind the developer's back would rewrite a
 * local database they may be mid-experiment on.
 */
export default defineNitroPlugin(async () => {
  if (!import.meta.dev) return

  try {
    const dir = join(process.cwd(), 'prisma', 'migrations')
    const onDisk = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    if (!onDisk.length) return

    // A database that has never been migrated has no `_prisma_migrations`
    // table at all; treat every migration as pending rather than throwing.
    const applied = new Set<string>()
    const table = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations';`
    )
    if (table.length) {
      const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`
      )
      for (const row of rows) applied.add(row.migration_name)
    }

    const pending = onDisk.filter((name) => !applied.has(name))
    if (!pending.length) return

    console.warn(
      `\n[migrations] ${pending.length} migration(s) not applied to this database:`
    )
    for (const name of pending) console.warn(`[migrations]   - ${name}`)
    console.warn(
      '[migrations] Queries against the new columns/tables will fail.'
    )
    console.warn('[migrations] Run: pnpm exec prisma migrate dev\n')
  } catch (error) {
    // Never block dev boot over a diagnostic.
    console.warn('[migrations] Could not check migration state:', error)
  }
})
