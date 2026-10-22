import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/**
 * `GitSyncBinding.seenFiles`: files a Pull or Push already landed, with the
 * blob sha they had then. Every layout classifies its files against it.
 */
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
