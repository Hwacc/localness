import type { ID } from '../types'
import clsx from 'clsx'
import SparkMD5 from 'spark-md5'
import { twMerge } from 'tailwind-merge'
import { zID } from './schemas'

export function cn(...args: any[]) {
  return twMerge(clsx(...args))
}

export async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function validID(id: ID): boolean {
  return zID.safeParse(id).success
}

export const timestampFilename = (file: File) => {
  const [filename, ext] = file.name.split('.')
  const timestamp = Date.now()
  return `${filename}-${timestamp}.${ext}`
}

export const fpTranslation = (origin: string) => {
  const normalizedOrigin = origin.replace(/\s+/g, '').trim()
  return SparkMD5.hash(normalizedOrigin)
}

export const DRAFT_KEY_PREFIX = '__draft_'

export function formatI18nKeyDisplay(key: string | null | undefined) {
  if (!key) return ''
  if (!key.startsWith(DRAFT_KEY_PREFIX)) return key
  const hash = key.slice(DRAFT_KEY_PREFIX.length)
  if (hash.length <= 5) return key
  return `${DRAFT_KEY_PREFIX}${hash.slice(0, 5)}`
}

/** Draft = never published, or any locale draft differs from published. */
export function isI18nKeyDraft(
  locales: Array<{ draftText: string | null; publishedText: string | null }>
) {
  if (!locales.length) return true
  const hasPublished = locales.some(
    (locale) => (locale.publishedText ?? '') !== ''
  )
  if (!hasPublished) return true
  return locales.some(
    (locale) => (locale.draftText ?? '') !== (locale.publishedText ?? '')
  )
}