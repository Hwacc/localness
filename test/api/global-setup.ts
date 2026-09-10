import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const dbPath = resolve(root, 'runtime/db/test.db')
const dbFiles = [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]

function removeDbFiles() {
  for (const file of dbFiles) {
    if (existsSync(file)) rmSync(file)
  }
}

/**
 * Rebuilds a throwaway sqlite db (migrate + seed) so API tests exercise real
 * routes/auth/prisma wiring instead of mocks. IDs are deterministic because
 * this always starts from an empty file — see `fixtures.ts`.
 */
export default async function setup() {
  removeDbFiles()
  mkdirSync(dirname(dbPath), { recursive: true })

  const env = { ...process.env, DATABASE_URL: `file:${dbPath}` }
  execSync('pnpm exec prisma migrate deploy', { cwd: root, env, stdio: 'inherit' })
  execSync('pnpm exec tsx test/api/seed.ts', { cwd: root, env, stdio: 'inherit' })

  process.env.DATABASE_URL = `file:${dbPath}`

  return () => {
    removeDbFiles()
  }
}
