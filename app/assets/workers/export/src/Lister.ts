import XLSX from 'xlsx'

/** One row of the sheet, already shaped by the server. */
export type ExportRow = {
  id: number | null
  keyId: number
  pic: string
  key: string
  origin: string
  texts: Record<string, string>
}

const FIXED_HEADER = ['id', 'key_id', 'pic', 'key', 'origin'] as const

/**
 * Builds the xlsx. One sheet, not one per framework: copy is a single set, and
 * a framework only ever changes generated syntax (see CLAUDE.md P2).
 */
class Lister {
  private rows: ExportRow[] = []
  private localeColumns: string[] = []

  public setRows(rows: ExportRow[], localeColumns: string[]) {
    this.rows = rows ?? []
    this.localeColumns = localeColumns ?? []
  }

  public async generateJson() {
    //TODO: generate json
    return Promise.resolve(null)
  }

  public async generateXlsx() {
    return new Promise((resolve, reject) => {
      try {
        const header = [...FIXED_HEADER, ...this.localeColumns]
        const aoo = this.rows.map((row) => ({
          id: row.id ?? '',
          key_id: row.keyId,
          pic: row.pic,
          key: row.key,
          origin: row.origin,
          ...this.localeColumns.reduce(
            (acc, locale) => {
              acc[locale] = row.texts?.[locale] ?? ''
              return acc
            },
            {} as Record<string, string>
          ),
        }))
        const workbook = XLSX.utils.book_new()
        const sheet = XLSX.utils.aoa_to_sheet([header])
        workbook.SheetNames.push('translations')
        workbook.Sheets['translations'] = sheet
        XLSX.utils.sheet_add_json(sheet, aoo, {
          origin: -1,
          skipHeader: true,
          header: [...header],
        })
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
        resolve(new Blob([buffer], { type: 'application/octet-stream' }))
      } catch (error) {
        reject(error)
      }
    })
  }
}

export { Lister }
