/**
 * Per-locale JSON files.
 *
 * The shape is not invented here: it is what the runtime endpoint
 * (`GET /projects/:id/translations/:locale?version=published`) serves and what a
 * Git batch file holds — a flat `{ key: text }` map, one file per locale, tab
 * indented with a trailing newline.
 *
 * Built from the same rows the sheet uses, so the two formats cannot disagree
 * about which keys are in the export.
 */

export type ExportJsonSourceRow = {
  key: string
  texts: Record<string, string>
}

export type ExportJsonFile = {
  /** Locale code, which is also the file name (`fr.json`). */
  locale: string
  entries: Record<string, string>
}

export function buildExportJson(params: {
  rows: ExportJsonSourceRow[]
  localeColumns: string[]
}): ExportJsonFile[] {
  const files: ExportJsonFile[] = []
  for (const locale of params.localeColumns) {
    const entries: Record<string, string> = {}
    for (const row of params.rows) {
      // A key with several tags has several rows; first one wins, and their
      // `texts` are identical anyway.
      if (row.key in entries) continue
      const text = row.texts?.[locale] ?? ''
      // Omitted rather than written as "": an empty string in a locale file
      // would override whatever fallback the consumer has.
      if (!text) continue
      entries[row.key] = text
    }
    // A locale with nothing published is left out rather than shipped as `{}`.
    if (Object.keys(entries).length) files.push({ locale, entries })
  }
  return files
}

/** Tab indented with a trailing newline, matching the Git batch files. */
export function serializeExportJson(file: ExportJsonFile) {
  return `${JSON.stringify(file.entries, null, '\t')}\n`
}
