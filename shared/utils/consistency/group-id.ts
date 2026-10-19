import { fpTranslation } from '../index'
import type { ScanKeyInput } from './types'

/**
 * Whitelist id for single-key findings. Embedding the key id and a hash of
 * the text means an edit changes the id, so an old whitelist row can never
 * permanently bury a finding whose text has since changed (R3).
 */
export function singleKeyGroupId(
  ruleId: string,
  keyId: number,
  text: string
): string {
  return `${ruleId}:${keyId}:${fpTranslation(text)}`
}

/**
 * The text a published-copy rule actually inspected: every locale's published
 * wording, locale-sorted. Hashing this (not the source draft) means a whitelist
 * row dies the moment ANY checked translation changes — ignoring a ja finding
 * must not also hide a later fr breakage on the same key.
 */
export function publishedSnapshotText(key: ScanKeyInput): string {
  return key.locales
    .filter((row) => row.publishedText)
    .map((row) => `${row.locale}\u0000${row.publishedText}`)
    .sort()
    .join('\u0001')
}
