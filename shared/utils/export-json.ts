/**
 * Per-locale JSON files, built from the same rows the sheet uses so the two
 * formats cannot disagree about which keys are in the export. The shape is the
 * one the runtime endpoint and the Git batches already use: flat `{ key: text }`,
 * one file per locale.
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
      // A key with several tags has several rows; they carry the same texts.
      if (row.key in entries) continue
      const text = row.texts?.[locale] ?? ''
      // An empty string would override whatever fallback the consumer has.
      if (!text) continue
      entries[row.key] = text
    }
    // No file for a locale with nothing published, rather than an empty one.
    if (Object.keys(entries).length) files.push({ locale, entries })
  }
  return files
}

/** Tab indented with a trailing newline, matching the Git batch files. */
export function serializeExportJson(file: ExportJsonFile) {
  return `${JSON.stringify(file.entries, null, '\t')}\n`
}
