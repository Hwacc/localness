import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const LOCALES = [
  'en',
  'zh_cn',
  'zh_tw',
  'ja',
  'ko',
  'ru',
  'fr',
  'de',
  'es',
  'pt',
] as const

function resolveDbPath() {
  const raw = process.env.DATABASE_URL || 'file:../runtime/db/dev.db'
  const filePath = raw.startsWith('file:') ? raw.slice('file:'.length) : raw
  if (path.isAbsolute(filePath)) return filePath
  return path.resolve(process.cwd(), filePath)
}

function tableExists(db: InstanceType<typeof Database>, name: string) {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name) as { name: string } | undefined
  return Boolean(row)
}

function main() {
  const dbPath = resolveDbPath()
  if (!fs.existsSync(dbPath)) {
    console.log(`[migrate-v2-domain] DB not found at ${dbPath}, skip.`)
    return
  }

  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  if (!tableExists(db, 'I18nKey')) {
    console.error(
      '[migrate-v2-domain] I18nKey table missing. Run `pnpm exec prisma migrate deploy` first.'
    )
    process.exit(1)
  }

  const teams = db.prepare(`SELECT id, name FROM Team`).all() as {
    id: number
    name: string
  }[]
  const projects = db
    .prepare(`SELECT id, name, team_id FROM Project`)
    .all() as { id: number; name: string; team_id: number }[]
  const keys = db.prepare(`SELECT COUNT(*) as c FROM I18nKey`).get() as {
    c: number
  }
  const values = db.prepare(`SELECT COUNT(*) as c FROM LocaleValue`).get() as {
    c: number
  }
  const conflicts = tableExists(db, 'I18nMigrateConflict')
    ? (db.prepare(`SELECT COUNT(*) as c FROM I18nMigrateConflict`).get() as {
        c: number
      })
    : { c: 0 }

  console.log(`[migrate-v2-domain] db=${dbPath}`)
  console.log(`[migrate-v2-domain] teams=${teams.length}`)
  for (const team of teams) {
    const owners = db
      .prepare(
        `SELECT u.username FROM UserTeam ut JOIN User u ON u.id = ut.user_id WHERE ut.team_id = ? AND ut.role = 'OWNER'`
      )
      .all(team.id) as { username: string }[]
    const members = db
      .prepare(`SELECT COUNT(*) as c FROM UserTeam WHERE team_id = ?`)
      .get(team.id) as { c: number }
    const teamProjects = projects.filter((p) => p.team_id === team.id)
    console.log(
      `  team#${team.id} ${team.name} owners=${owners.map((o) => o.username).join(',') || '-'} members=${members.c} projects=${teamProjects.length}`
    )
  }
  console.log(`[migrate-v2-domain] projects=${projects.length}`)
  console.log(`[migrate-v2-domain] i18nKeys=${keys.c} localeValues=${values.c}`)
  console.log(`[migrate-v2-domain] vue/react conflicts=${conflicts.c}`)
  if (conflicts.c > 0) {
    const rows = db
      .prepare(
        `SELECT project_id, key, locale, vue_text, react_text, tag_ids FROM I18nMigrateConflict LIMIT 50`
      )
      .all()
    console.log('[migrate-v2-domain] conflict sample:', rows)
  }

  if (tableExists(db, 'Translation') || tableExists(db, 'UserProject')) {
    console.warn(
      '[migrate-v2-domain] Legacy Translation/UserProject still present. Prisma migrate did not finish dropping old tables.'
    )
  }

  console.log(
    `[migrate-v2-domain] locales expected=${LOCALES.join(',')} (STRING only)`
  )
  db.close()
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  main()
}

export { main }
