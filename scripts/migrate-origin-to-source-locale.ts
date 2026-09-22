import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { config as loadEnv } from 'dotenv'
import { DEFAULT_LOCALE_FALLBACK } from '../shared/constants'

/**
 * Backfill a key's original text into its project's source language.
 *
 * Until now the original text lived in `I18nKey.origin` and the source locale's
 * row was usually empty (the editor wrote only the column). The model is now
 * "the source language's draft *is* the original text", so this copies the
 * column into that row once — before the column is dropped.
 *
 * Raw SQL on purpose: the column this reads is about to disappear, so the script
 * must not depend on the Prisma client's shape. Idempotent, and dry by default.
 * A database that has already lost the column is a no-op, so this stays safe to
 * leave in the repo.
 *
 *   tsx scripts/migrate-origin-to-source-locale.ts                    # report only
 *   tsx scripts/migrate-origin-to-source-locale.ts --backup <path>    # consistent copy
 *   tsx scripts/migrate-origin-to-source-locale.ts --apply            # write
 *
 * `--apply` exits non-zero when the check below is not clean, so whoever is
 * driving it can refuse to ship the release that drops the column.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type OriginBackfillOutcome =
  /** The row is missing or blank, and the column has text: copy it over. */
  | 'backfill'
  /** Both sides already agree (whitespace-insensitive): nothing to do. */
  | 'keep'
  /** Both sides have text and they differ: reported, never overwritten. */
  | 'diverged'
  /** No original text in the column: nothing to carry. */
  | 'empty-origin'

/**
 * What one key needs. Pure, so the decision is testable without a database.
 * An existing source-language text always wins — it is the side a person may
 * have edited, while the column is usually the raw OCR string.
 */
export function classifyOriginBackfill(input: {
  origin: string
  sourceDraft: string | null
}): OriginBackfillOutcome {
  const origin = input.origin.trim()
  if (!origin) return 'empty-origin'
  const draft = (input.sourceDraft ?? '').trim()
  if (!draft) return 'backfill'
  return draft === origin ? 'keep' : 'diverged'
}

/** Same normalization `fpTranslation` uses, so a recomputed value matches it. */
export function fingerprintOf(text: string) {
  return createHash('md5')
    .update(text.replace(/\s+/g, '').trim())
    .digest('hex')
}

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || 'file:./runtime/db/dev.db'
  const filePath = raw.startsWith('file:') ? raw.slice('file:'.length) : raw
  if (isAbsolute(filePath)) return filePath
  return resolve(repoRoot, filePath)
}

type ProjectRow = { id: number; locale_fallback: string | null }
type KeyRow = {
  id: number
  key: string
  origin: string
  fingerprint: string
}

const SAMPLE_LIMIT = 50

export function main() {
  const apply = process.argv.includes('--apply')
  const backupAt = process.argv.indexOf('--backup')
  const backupPath = backupAt >= 0 ? process.argv[backupAt + 1] : undefined
  // Loaded here, not at import time: importing this module (the unit test does)
  // must not touch the process environment.
  loadEnv({ path: join(repoRoot, '.env') })
  const dbPath = resolveDbPath()
  if (!fs.existsSync(dbPath)) {
    console.log(`[source-locale] DB not found at ${dbPath}, nothing to do.`)
    return
  }

  /*
   * A copy taken with SQLite's own `VACUUM INTO`: consistent even while the app
   * keeps writing, which copying the file is not. Destructive runs go through
   * this, so the rollback of the release that drops the column has something to
   * go back to.
   */
  if (backupAt >= 0) {
    if (!backupPath) {
      console.error('[source-locale] --backup needs a path')
      process.exitCode = 2
      return
    }
    const source = new Database(dbPath, { readonly: true })
    source.exec(`VACUUM INTO '${backupPath.split(sep).join('/')}'`)
    source.close()
    console.log(`[source-locale] backup written to ${backupPath}`)
    return
  }

  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  const columns = db
    .prepare(`SELECT name FROM pragma_table_info('I18nKey')`)
    .all() as { name: string }[]
  if (!columns.some((column) => column.name === 'origin')) {
    console.log(
      '[source-locale] I18nKey.origin is already gone — nothing to backfill.'
    )
    db.close()
    return
  }

  const projects = db
    .prepare(
      `SELECT p.id, s.locale_fallback
       FROM Project p
       LEFT JOIN ProjectSettings s ON s.project_id = p.id`
    )
    .all() as ProjectRow[]

  const counts: Record<OriginBackfillOutcome, number> = {
    backfill: 0,
    keep: 0,
    diverged: 0,
    'empty-origin': 0,
  }
  const diverged: Array<{ project: number; key: string; origin: string; draft: string }> = []
  let fingerprintsFixed = 0

  const upsertDraft = db.prepare(
    `INSERT INTO LocaleValue (i18n_key_id, locale, draft_text, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (i18n_key_id, locale)
     DO UPDATE SET draft_text = excluded.draft_text, updated_at = CURRENT_TIMESTAMP`
  )
  // Only the fingerprint moves: the original text the user sees is what changed,
  // and leaving `updated_at` alone keeps the list's "updated" ordering honest.
  const setFingerprint = db.prepare(
    `UPDATE I18nKey SET fingerprint = ? WHERE id = ?`
  )

  db.transaction(() => {
    for (const project of projects) {
      const sourceLocale = project.locale_fallback || DEFAULT_LOCALE_FALLBACK
      const keys = db
        .prepare(
          `SELECT id, key, origin, fingerprint FROM I18nKey WHERE project_id = ?`
        )
        .all(project.id) as KeyRow[]
      if (!keys.length) continue

      const drafts = new Map<number, string | null>(
        (
          db
            .prepare(
              `SELECT lv.i18n_key_id AS id, lv.draft_text AS draft
               FROM LocaleValue lv
               JOIN I18nKey k ON k.id = lv.i18n_key_id
               WHERE k.project_id = ? AND lv.locale = ?`
            )
            .all(project.id, sourceLocale) as Array<{
            id: number
            draft: string | null
          }>
        ).map((row) => [row.id, row.draft])
      )

      const projectCounts: Record<OriginBackfillOutcome, number> = {
        backfill: 0,
        keep: 0,
        diverged: 0,
        'empty-origin': 0,
      }

      for (const key of keys) {
        const draft = drafts.get(key.id) ?? null
        const outcome = classifyOriginBackfill({
          origin: key.origin,
          sourceDraft: draft,
        })
        counts[outcome] += 1
        projectCounts[outcome] += 1

        if (outcome === 'diverged') {
          diverged.push({
            project: project.id,
            key: key.key,
            origin: key.origin,
            draft: draft ?? '',
          })
        }
        if (outcome === 'backfill' && apply) {
          upsertDraft.run(key.id, sourceLocale, key.origin)
        }

        // The original text a key will be read by is the source language's draft,
        // so its fingerprint has to follow that text — never the blank case, which
        // has no text to hash and already carries an empty fingerprint.
        const text =
          outcome === 'backfill' ? key.origin : (draft ?? '')
        const expected = text.trim() ? fingerprintOf(text) : ''
        if (expected && expected !== key.fingerprint) {
          fingerprintsFixed += 1
          if (apply) setFingerprint.run(expected, key.id)
        }
      }

      console.log(
        `[source-locale] project#${project.id} locale=${sourceLocale} keys=${keys.length} ` +
          `backfill=${projectCounts.backfill} keep=${projectCounts.keep} ` +
          `diverged=${projectCounts.diverged} empty=${projectCounts['empty-origin']}`
      )
    }
  })()

  console.log(
    `[source-locale] total keys=${Object.values(counts).reduce((a, b) => a + b, 0)} ` +
      `backfill=${counts.backfill} keep=${counts.keep} diverged=${counts.diverged} ` +
      `empty=${counts['empty-origin']} fingerprints=${fingerprintsFixed}`
  )

  if (diverged.length) {
    console.log(
      `\n[source-locale] diverged rows (kept the locale text, nothing written): ${diverged.length}`
    )
    for (const row of diverged.slice(0, SAMPLE_LIMIT)) {
      console.log(
        `  project#${row.project} ${row.key}\n    origin: ${JSON.stringify(row.origin)}\n    locale: ${JSON.stringify(row.draft)}`
      )
    }
    if (diverged.length > SAMPLE_LIMIT) {
      console.log(`  …and ${diverged.length - SAMPLE_LIMIT} more`)
    }
  }

  /*
   * The go/no-go check for dropping the column: once this runs clean, every key
   * that has an original text also has it in the source language's row.
   */
  const sourceRows = db
    .prepare(
      `SELECT k.id, k.fingerprint, COALESCE(lv.draft_text, '') AS draft
       FROM I18nKey k
       LEFT JOIN Project p ON p.id = k.project_id
       LEFT JOIN ProjectSettings s ON s.project_id = p.id
       LEFT JOIN LocaleValue lv
         ON lv.i18n_key_id = k.id
        AND lv.locale = COALESCE(NULLIF(s.locale_fallback, ''), ?)`
    )
    .all(DEFAULT_LOCALE_FALLBACK) as Array<{
    id: number
    fingerprint: string
    draft: string
  }>
  const missing = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM I18nKey k
       LEFT JOIN Project p ON p.id = k.project_id
       LEFT JOIN ProjectSettings s ON s.project_id = p.id
       LEFT JOIN LocaleValue lv
         ON lv.i18n_key_id = k.id
        AND lv.locale = COALESCE(NULLIF(s.locale_fallback, ''), ?)
       WHERE TRIM(k.origin) != '' AND COALESCE(TRIM(lv.draft_text), '') = ''`
    )
    .get(DEFAULT_LOCALE_FALLBACK) as { c: number }
  // Counted in JS with the same helper the writes use: the fingerprint is a hash
  // of normalized text, which SQL cannot reproduce without a custom function.
  const fingerprintMismatches = sourceRows.filter(
    (row) => row.draft.trim() && fingerprintOf(row.draft) !== row.fingerprint
  ).length

  console.log(`\n[source-locale] ${apply ? 'after' : 'before'} this run — db=${dbPath}`)
  console.log(
    `  keys with an original text but no source-language row: ${missing.c}${missing.c ? '  <- must be 0 before the column is dropped' : ''}`
  )
  console.log(
    `  fingerprints that disagree with the source text: ${fingerprintMismatches}${fingerprintMismatches ? '  <- must be 0 before the column is dropped' : ''}`
  )
  if (!apply) {
    console.log(
      '\n[source-locale] dry run — nothing written. Re-run with --apply to backfill.'
    )
  } else if (missing.c || fingerprintMismatches) {
    console.error(
      '\n[source-locale] the check is not clean after backfilling: do NOT ship the release that drops I18nKey.origin yet.'
    )
    process.exitCode = 1
  }
  db.close()
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  main()
}
