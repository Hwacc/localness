import { createError } from 'h3'
import { createHash, randomBytes } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { relative, sep, join } from 'node:path'
import type { GitSyncPullReason } from '#shared/constants'
import { classifyFile } from './filters'
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
  let names: string[]
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

export type SeenFile = { path: string; sha: string }

/**
 * Accepts both the legacy `string[]` shape and the current
 * `{ path, sha }[]` shape. Legacy rows get an empty sha, which reads as
 * "seen, content unknown" — see `classifyFile`.
 */
export function parseSeenFiles(raw: unknown): SeenFile[] {
  if (!Array.isArray(raw)) return []
  const byPath = new Map<string, SeenFile>()
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item) byPath.set(item, { path: item, sha: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const path = (item as { path?: unknown }).path
    const sha = (item as { sha?: unknown }).sha
    if (typeof path !== 'string' || !path) continue
    byPath.set(path, {
      path,
      sha: typeof sha === 'string' ? sha : '',
    })
  }
  return [...byPath.values()]
}

export function seenFileMap(raw: unknown): Map<string, string> {
  return new Map(parseSeenFiles(raw).map((f) => [f.path, f.sha]))
}

/**
 * Git's blob id for the file's exact bytes. Same value git itself stores,
 * so a rewritten file gets a different sha even if the path is unchanged.
 */
export async function blobSha(path: string): Promise<string> {
  const data = await readFile(path)
  const header = Buffer.from(`blob ${data.length}\0`, 'utf8')
  return createHash('sha1')
    .update(Buffer.concat([header, data]))
    .digest('hex')
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

/** HHMMSS-hex, as written by `buildSourceFilename`. */
const LOCALNESS_BATCH_ID = /^\d{6}-[0-9a-f]+$/i

/**
 * Merge order: calendar date, then connector batches, then Localness
 * timed batches (later time wins). Raw string sort is wrong on the same
 * day: a LILT uuid `5dbd…` sorts after `081602-…`, so the older connector
 * file would overwrite a push we just landed.
 */
export function liltBatchSortKey(date: string, batchId: string): string {
  const rank = LOCALNESS_BATCH_ID.test(batchId) ? '1' : '0'
  return `${date}-${rank}-${batchId}`
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
  let entries: string[]
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
    sortKey: `${liltBatchSortKey(parsed.date, parsed.batchId)}-${path}`,
  }
}

export type RemoteFileInfo = {
  relPath: string
  sha: string
  locale: string | null
  remoteLocale: string
  date: string
  reason: GitSyncPullReason
}

/**
 * Lists every LILT batch file for the product, in merge order, tagged with
 * why it is (or is not) a pull candidate. Does not read file contents beyond
 * hashing — parsing happens in `readSelectedLocaleMaps`.
 */
export async function listRemoteFiles(
  repoRoot: string,
  product: string,
  localeOverride?: Record<string, string> | null,
  seen?: Map<string, string>
): Promise<RemoteFileInfo[]> {
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
  const out: RemoteFileInfo[] = []
  for (const file of files) {
    const relPath = toRepoRelPath(repoRoot, file.path)
    const sha = await blobSha(file.path)
    out.push({
      relPath,
      sha,
      locale: remoteToLocale(file.remoteLocale, localeOverride),
      remoteLocale: file.remoteLocale,
      date: file.date,
      reason: classifyFile(relPath, sha, seen ?? new Map()),
    })
  }
  return out
}

/**
 * Merges the selected files into per-locale maps. Files are applied in the
 * order given, so later entries win — callers must pass merge order.
 */
export async function readSelectedLocaleMaps(
  repoRoot: string,
  files: RemoteFileInfo[]
): Promise<{
  maps: RemoteLocaleMap
  origin: Map<string, string>
}> {
  const maps: RemoteLocaleMap = new Map()
  const origin = new Map<string, string>()
  for (const file of files) {
    if (!file.locale) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(join(repoRoot, file.relPath), 'utf8'))
    } catch {
      continue
    }
    let map: Record<string, string>
    try {
      map = validateFlatJson(parsed)
    } catch {
      continue
    }
    let localeMap = maps.get(file.locale)
    if (!localeMap) {
      localeMap = new Map()
      maps.set(file.locale, localeMap)
    }
    for (const [key, text] of Object.entries(map)) {
      localeMap.set(key, text)
      origin.set(`${file.locale}\0${key}`, file.relPath)
    }
  }
  return { maps, origin }
}

function isProductSourcePath(relPath: string, product: string): boolean {
  const n = relPath.replace(/\\/g, '/')
  return n.startsWith(`${product}/source/`)
}

/**
 * Merged source-locale dictionary from `product/source/` only (not
 * `translated/`). Later filename wins, same order as Pull.
 */
export async function readMergedSourceLocale(
  repoRoot: string,
  product: string,
  sourceLocale: string,
  localeOverride?: Record<string, string> | null
): Promise<Map<string, string>> {
  const files = await listRemoteFiles(repoRoot, product, localeOverride)
  const sourceFiles = files.filter(
    (f) => f.locale === sourceLocale && isProductSourcePath(f.relPath, product)
  )
  const { maps } = await readSelectedLocaleMaps(repoRoot, sourceFiles)
  return maps.get(sourceLocale) ?? new Map()
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
