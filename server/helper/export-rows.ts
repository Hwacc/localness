/**
 * Turns a selection of keys into export rows. Kept free of Prisma so the row
 * rules are testable on their own: the endpoint loads, this decides.
 */

/** A tag as the exporter needs it: which page it sits on, and its key. */
export type ExportTagInput = {
  id: number
  pageId: number
  i18nKeyId: number | null
}

export type ExportKeyInput = {
  id: number
  key: string
  locales: Array<{
    locale: string
    publishedText: string | null
  }>
}

export type ExportRow = {
  /** Tag id, empty for a key that produced no tag row. */
  id: number | null
  keyId: number
  /** Screenshot filename, empty for a key with no tag on the chosen pages. */
  pic: string
  key: string
  /** Published text per locale column. Missing locales are empty strings. */
  texts: Record<string, string>
}

export type ExportSkipReason = 'no-published-text'

export type ExportRowsResult = {
  rows: ExportRow[]
  /** Keys that produced no row at all, by reason. */
  skipped: Record<ExportSkipReason, number>
  /** Keys that landed as a `pic`-less row because no tag matched. */
  keysWithoutTag: number
  /** Tag ids that belong in the exported screenshots. */
  tagIds: number[]
}

/**
 * Locale columns for the sheet: the picked ones in their given order, with the
 * source language kept in front when asked for — its column is where the sheet's
 * original text lives, so it leads.
 */
export function exportLocaleColumns(params: {
  locales: string[]
  fallbackLocale: string
  includeFallbackLocale: boolean
}): string[] {
  const picked = params.locales.filter((locale, index, all) => {
    return Boolean(locale) && all.indexOf(locale) === index
  })
  if (!params.includeFallbackLocale) return picked
  if (!params.fallbackLocale) return picked
  if (picked.includes(params.fallbackLocale)) return picked
  return [params.fallbackLocale, ...picked]
}

/**
 * One row per tag of a selected key on a selected page. A selected key with no
 * such tag still gets a row with an empty `pic` — a plain translation entry is
 * exportable, and a key the user explicitly picked must never vanish silently.
 * A key with no published text anywhere produces nothing: export ships
 * published copy only.
 */
export function buildExportRows(params: {
  keys: ExportKeyInput[]
  tags: ExportTagInput[]
  /** Screenshot filename per page id, for the `pic` column. */
  picByPageId: Map<number, string>
  localeColumns: string[]
}): ExportRowsResult {
  const tagsByKeyId = new Map<number, ExportTagInput[]>()
  for (const tag of params.tags) {
    if (tag.i18nKeyId == null) continue
    if (!params.picByPageId.has(tag.pageId)) continue
    const list = tagsByKeyId.get(tag.i18nKeyId)
    if (list) list.push(tag)
    else tagsByKeyId.set(tag.i18nKeyId, [tag])
  }

  const rows: ExportRow[] = []
  const tagIds: number[] = []
  const skipped: Record<ExportSkipReason, number> = { 'no-published-text': 0 }
  let keysWithoutTag = 0

  for (const key of params.keys) {
    const published = new Map<string, string>()
    for (const locale of key.locales) {
      const text = locale.publishedText ?? ''
      if (text !== '') published.set(locale.locale, text)
    }
    if (!published.size) {
      skipped['no-published-text'] += 1
      continue
    }
    const texts: Record<string, string> = {}
    for (const locale of params.localeColumns) {
      texts[locale] = published.get(locale) ?? ''
    }
    const tags = tagsByKeyId.get(key.id) ?? []
    if (!tags.length) {
      keysWithoutTag += 1
      rows.push({
        id: null,
        keyId: key.id,
        pic: '',
        key: key.key,
        texts,
      })
      continue
    }
    for (const tag of tags) {
      tagIds.push(tag.id)
      rows.push({
        id: tag.id,
        keyId: key.id,
        pic: params.picByPageId.get(tag.pageId) ?? '',
        key: key.key,
        texts,
      })
    }
  }

  return { rows, skipped, keysWithoutTag, tagIds }
}
