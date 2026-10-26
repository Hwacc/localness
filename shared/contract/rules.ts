import SparkMD5 from 'spark-md5'

/**
 * Rules a client must apply the same way the server does. A draft key is named
 * after the text it was created from, so a plugin and the server that disagree
 * on `fpTranslation` mint two keys for one sentence. Pure functions only; a
 * change in behaviour here is a breaking change of the package.
 */

type RowId = string | number

/** Whitespace is not part of the sentence: `'Save\n As'` and `'SaveAs'` collide on purpose. */
export const fpTranslation = (text: string) => {
  const normalized = text.replace(/\s+/g, '').trim()
  return SparkMD5.hash(normalized)
}

/** Keys that only carry a text's fingerprint, awaiting a real name. */
export const DRAFT_KEY_PREFIX = '__draft_'

/** What a person sees for a key: a draft key's fingerprint is cut to five characters. */
export function formatI18nKeyDisplay(key: string | null | undefined) {
  if (!key) return ''
  if (!key.startsWith(DRAFT_KEY_PREFIX)) return key
  const hash = key.slice(DRAFT_KEY_PREFIX.length)
  if (hash.length <= 5) return key
  return `${DRAFT_KEY_PREFIX}${hash.slice(0, 5)}`
}

/**
 * Which release the workspace is looking at: `'all'`, `'unassigned'`, or one
 * release's id. The client twin of the server's `ReleaseFilter`.
 */
export type ReleaseFilterValue = 'all' | 'unassigned' | number

/** Ids are compared as strings: a row's ids come back from JSON while a picker emits numbers. */
export function entryMatchesReleaseFilter(
  releaseIds: RowId[] | undefined,
  filter: ReleaseFilterValue
) {
  if (filter === 'all') return true
  const ids = releaseIds ?? []
  if (filter === 'unassigned') return ids.length === 0
  return ids.some((releaseId) => String(releaseId) === String(filter))
}
