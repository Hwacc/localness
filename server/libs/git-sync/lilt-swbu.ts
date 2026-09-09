import { createError } from 'h3'
import { randomBytes } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { relative, sep, join } from 'node:path'
import { remoteToLocale } from './credentials'

export const LILT_FILENAME =
  /^(\d{8})-(.+)_(.+)\.(json|txt)$/i

export type RemoteLocaleMap = Map<string, Map<string, string>>

/** Product folder names only — actual folders come from the remote. */
export function isLiltProduct(product: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(product)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function listLiltProducts(
  repoRoot: string
): Promise<{ value: string; label: string }[]> {
  let names: string[] = []
  try {
    names = await readdir(repoRoot)
  } catch {
    return []
  }
  const out: { value: string; label: string }[] = []
  for (const name of names) {
    if (name.startsWith('.') || !isLiltProduct(name)) continue
    const root = join(repoRoot, name)
    if (!(await isDirectory(root))) continue
    const hasLayout =
      (await isDirectory(join(root, 'source'))) ||
      (await isDirectory(join(root, 'translated')))
    if (!hasLayout) continue
    out.push({ value: name, label: name })
  }
  out.sort((a, b) => a.value.localeCompare(b.value))
  return out
}

export function toRepoRelPath(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/')
}

export function parseSeenFiles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [
    ...new Set(
      raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
    ),
  ]
}

export function parseLiltFilename(name: string): {
  date: string
  batchId: string
  remoteLocale: string
} | null {
  const match = name.match(LILT_FILENAME)
  if (!match) return null
  return {
    date: match[1]!,
    batchId: match[2]!,
    remoteLocale: match[3]!,
  }
}

export function validateFlatJson(data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'LILT JSON must be a flat object',
    })
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw createError({
        statusCode: 400,
        statusMessage: `LILT JSON value for ${key} must be a string`,
      })
    }
    out[key] = value
  }
  return out
}

export function buildSourceFilename(sourceRemoteLocale: string): string {
  const day = new Date()
  const y = day.getUTCFullYear()
  const m = String(day.getUTCMonth() + 1).padStart(2, '0')
  const d = String(day.getUTCDate()).padStart(2, '0')
  const hh = String(day.getUTCHours()).padStart(2, '0')
  const mm = String(day.getUTCMinutes()).padStart(2, '0')
  const ss = String(day.getUTCSeconds()).padStart(2, '0')
  const batchId = `${hh}${mm}${ss}-${randomBytes(8).toString('hex')}`
  return `${y}${m}${d}-${batchId}_${sourceRemoteLocale}.json`
}

type FileHit = {
  date: string
  batchId: string
  sortKey: string
  path: string
  remoteLocale: string
}

async function listJsonFiles(dir: string): Promise<string[]> {
  let entries: string[] = []
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const nested: string[] = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const parsed = parseLiltFilename(name)
    if (parsed) {
      nested.push(full)
      continue
    }
    try {
      const inner = await readdir(full)
      for (const child of inner) {
        if (parseLiltFilename(child)) nested.push(join(full, child))
      }
    } catch {
      // not a directory
    }
  }
  return nested
}

function fileSortKey(path: string): FileHit | null {
  const name = path.split(/[/\\]/).pop() ?? ''
  const parsed = parseLiltFilename(name)
  if (!parsed) return null
  return {
    ...parsed,
    path,
    sortKey: `${parsed.date}-${parsed.batchId}-${path}`,
  }
}

export async function readRemoteLocaleMaps(
  repoRoot: string,
  product: string,
  localeOverride?: Record<string, string> | null,
  skipRelPaths?: Set<string>
): Promise<{ maps: RemoteLocaleMap; allRelPaths: string[]; newRelPaths: string[] }> {
  const result: RemoteLocaleMap = new Map()
  const dirs = [
    join(repoRoot, product, 'translated'),
    join(repoRoot, product, 'source'),
  ]
  const files: FileHit[] = []
  for (const dir of dirs) {
    const list = await listJsonFiles(dir)
    for (const path of list) {
      const hit = fileSortKey(path)
      if (hit) files.push(hit)
    }
  }
  files.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  const allRelPaths: string[] = []
  const newRelPaths: string[] = []
  for (const file of files) {
    const rel = toRepoRelPath(repoRoot, file.path)
    allRelPaths.push(rel)
    if (skipRelPaths?.has(rel)) continue
    newRelPaths.push(rel)
    const local = remoteToLocale(file.remoteLocale, localeOverride)
    if (!local) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(file.path, 'utf8'))
    } catch {
      continue
    }
    let map: Record<string, string>
    try {
      map = validateFlatJson(parsed)
    } catch {
      continue
    }
    let localeMap = result.get(local)
    if (!localeMap) {
      localeMap = new Map()
      result.set(local, localeMap)
    }
    for (const [key, text] of Object.entries(map)) {
      localeMap.set(key, text)
    }
  }
  return { maps: result, allRelPaths, newRelPaths }
}

export async function writeSourceBatch(params: {
  repoRoot: string
  product: string
  sourceRemoteLocale: string
  entries: Record<string, string>
}): Promise<string> {
  const dir = join(params.repoRoot, params.product, 'source')
  await mkdir(dir, { recursive: true })
  const filename = buildSourceFilename(params.sourceRemoteLocale)
  const path = join(dir, filename)
  await writeFile(path, `${JSON.stringify(params.entries, null, '\t')}\n`, 'utf8')
  return filename
}
