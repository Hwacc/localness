import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createError } from 'h3'
import {
  DEFAULT_LOCALE_FILE_PATTERN,
  LocaleFileFormat,
  localeFileName,
  localeFilePath,
  readLocaleFile,
  unwritableKeys,
  writeLocaleFile,
  type LocaleFileContent,
} from '#shared/contract/locale-file'
import { classifyFile } from '../../engine/filters'
import { blobSha } from '../../engine/seen-files'
import type { RemoteFileInfo, RemoteLocaleMap } from '../types'

/**
 * `locale-files` layout: one file per locale under a directory, named by a
 * pattern such as `{locale}.json` or `{locale}/translation.json`, and
 * rewritten in place on push. Files are looked up from the project's locales,
 * so a stray file in the directory is never read.
 */

export type LocaleFilesOptions = {
  pattern: string
  format: LocaleFileFormat
}

export type LocaleFilesContext = {
  repoRoot: string
  dir: string
  options: LocaleFilesOptions
  localeMap: Record<string, string> | null
  locales: string[]
}

export function parseLocaleFilesOptions(raw: unknown): LocaleFilesOptions {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const pattern =
    typeof obj.pattern === 'string' && obj.pattern.trim()
      ? obj.pattern.trim()
      : DEFAULT_LOCALE_FILE_PATTERN
  const format =
    obj.format === LocaleFileFormat.FLAT_JSON
      ? LocaleFileFormat.FLAT_JSON
      : LocaleFileFormat.NESTED_JSON
  return { pattern, format }
}

function relPathOf(ctx: LocaleFilesContext, locale: string): string {
  return localeFilePath(ctx.dir, ctx.options.pattern, locale, ctx.localeMap)
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function listLocaleFiles(
  ctx: LocaleFilesContext,
  seen?: Map<string, string>
): Promise<RemoteFileInfo[]> {
  const out: RemoteFileInfo[] = []
  for (const locale of ctx.locales) {
    const relPath = relPathOf(ctx, locale)
    const abs = join(ctx.repoRoot, relPath)
    if (!(await isFile(abs))) continue
    const sha = await blobSha(abs)
    out.push({
      relPath,
      sha,
      locale,
      remoteLocale: localeFileName(locale, ctx.localeMap),
      date: '',
      reason: classifyFile(relPath, sha, seen ?? new Map()),
    })
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

/** Unreadable files are skipped, as the LILT reader skips a bad batch. */
export async function readLocaleFileMaps(
  repoRoot: string,
  files: RemoteFileInfo[]
): Promise<{ maps: RemoteLocaleMap; origin: Map<string, string> }> {
  const maps: RemoteLocaleMap = new Map()
  const origin = new Map<string, string>()
  for (const file of files) {
    if (!file.locale) continue
    const text = await readText(join(repoRoot, file.relPath))
    if (text === null) continue
    let entries: Record<string, string>
    try {
      entries = readLocaleFile(text).entries
    } catch {
      continue
    }
    const map = maps.get(file.locale) ?? new Map<string, string>()
    for (const [key, value] of Object.entries(entries)) {
      map.set(key, value)
      origin.set(`${file.locale}\0${key}`, file.relPath)
    }
    maps.set(file.locale, map)
  }
  return { maps, origin }
}

/** The source file's current text, or null when it does not exist yet. */
async function readSourceText(
  ctx: LocaleFilesContext,
  sourceLocale: string
): Promise<string | null> {
  return readText(join(ctx.repoRoot, relPathOf(ctx, sourceLocale)))
}

/** Push refuses a source file it cannot parse rather than overwrite it. */
async function readSourceFile(
  ctx: LocaleFilesContext,
  sourceLocale: string
): Promise<LocaleFileContent> {
  const text = (await readSourceText(ctx, sourceLocale)) ?? '{}'
  try {
    return readLocaleFile(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw createError({
      statusCode: 422,
      statusMessage: `${relPathOf(ctx, sourceLocale)}: ${reason}`,
    })
  }
}

export async function readLocaleFileSource(
  ctx: LocaleFilesContext,
  sourceLocale: string
): Promise<Map<string, string>> {
  const file = await readSourceFile(ctx, sourceLocale)
  return new Map(Object.entries(file.entries))
}

export async function unwritableSourceKeys(
  ctx: LocaleFilesContext,
  sourceLocale: string,
  keys: string[]
): Promise<Set<string>> {
  const file = await readSourceFile(ctx, sourceLocale)
  return unwritableKeys(file, keys, ctx.options.format)
}

export async function writeLocaleFileSource(
  ctx: LocaleFilesContext,
  sourceLocale: string,
  entries: Record<string, string>
): Promise<{ relPath: string; sha: string }> {
  const relPath = relPathOf(ctx, sourceLocale)
  const abs = join(ctx.repoRoot, relPath)
  const next = writeLocaleFile(
    await readText(abs),
    entries,
    ctx.options.format
  )
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, next, 'utf8')
  return { relPath, sha: await blobSha(abs) }
}
