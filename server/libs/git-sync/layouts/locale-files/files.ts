import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { createError } from 'h3'
import {
  GIT_SYNC_DEFAULT_PATTERN,
  GIT_SYNC_LOCALE_PLACEHOLDER,
  GitSyncFileFormat,
} from '#shared/constants'
import { classifyFile } from '../../engine/filters'
import { blobSha } from '../../engine/seen-files'
import type { RemoteFileInfo, RemoteLocaleMap } from '../types'
import {
  readLocaleFile,
  unwritableKeys,
  writeLocaleFile,
  type LocaleFileContent,
} from './json-file'

/**
 * `locale-files` layout: one file per locale under a directory, named by a
 * pattern such as `{locale}.json` or `{locale}/translation.json`, and
 * rewritten in place on push. Files are looked up from the project's locales,
 * so a stray file in the directory is never read.
 */

export type LocaleFilesOptions = {
  pattern: string
  format: GitSyncFileFormat
}

export type LocaleFilesContext = {
  repoRoot: string
  dir: string
  options: LocaleFilesOptions
  localeMap: Record<string, string> | null
  locales: string[]
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validPath(path: string): boolean {
  return path.split('/').every((segment) => SEGMENT.test(segment))
}

export function parseLocaleFilesOptions(raw: unknown): LocaleFilesOptions {
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const pattern =
    typeof obj.pattern === 'string' && obj.pattern.trim()
      ? obj.pattern.trim()
      : GIT_SYNC_DEFAULT_PATTERN
  const format =
    obj.format === GitSyncFileFormat.FLAT_JSON
      ? GitSyncFileFormat.FLAT_JSON
      : GitSyncFileFormat.NESTED_JSON
  return { pattern, format }
}

/** Error text for an unusable directory / pattern, or null. */
export function localeFilesScopeError(
  dir: string,
  options: LocaleFilesOptions
): string | null {
  if (!validPath(dir)) {
    return 'Directory must be a relative path like src/locales'
  }
  const { pattern } = options
  if (pattern.split(GIT_SYNC_LOCALE_PLACEHOLDER).length !== 2) {
    return `File pattern must contain ${GIT_SYNC_LOCALE_PLACEHOLDER} exactly once`
  }
  if (!pattern.toLowerCase().endsWith('.json')) {
    return 'File pattern must end with .json'
  }
  if (!validPath(pattern.replace(GIT_SYNC_LOCALE_PLACEHOLDER, 'en'))) {
    return 'File pattern must be a relative path like {locale}.json'
  }
  return null
}

/**
 * `zh_cn` → `zh-CN`, `en` → `en`: the BCP 47 shape app repos name files by.
 * An explicit `localeMap` entry wins.
 */
export function localeFileName(
  locale: string,
  localeMap: Record<string, string> | null
): string {
  const mapped = localeMap?.[locale]
  if (mapped) return mapped
  const [language, ...rest] = locale.split('_')
  return [language, ...rest.map((part) => part.toUpperCase())].join('-')
}

function relPathOf(ctx: LocaleFilesContext, locale: string): string {
  const name = ctx.options.pattern.replace(
    GIT_SYNC_LOCALE_PLACEHOLDER,
    localeFileName(locale, ctx.localeMap)
  )
  return posix.join(ctx.dir, name)
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
