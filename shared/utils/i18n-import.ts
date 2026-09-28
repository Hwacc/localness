import {
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from 'jsonc-parser'
import { TRANSLATION_LANGUAGES } from '../constants'

/**
 * Parsing for the translations import. Runs in the browser — the server only
 * ever sees the mapped `{ locale: { key: text } }` — but lives in `shared/` so
 * the server can normalise a hand-rolled payload the same way.
 *
 * A key defined more than once is not an error: the last non-empty value is
 * imported. What this module owes the user is an exact account of where each
 * definition was and which one won, so duplicates are kept as data rather than
 * collapsed into a one-line warning.
 */

/** Nested JSON joins its path with this. Not the project's key separator: see `parseLocaleJson`. */
export const IMPORT_KEY_SEPARATOR = '.'

/** Distinct keys one import may carry. Headroom for real locale files, a stop for runaway ones. */
export const IMPORT_MAX_KEYS = 20_000

/** Columns a sheet exported by Localness carries that are not locales. */
const NON_LOCALE_COLUMNS = new Set(['id', 'key_id', 'pic'])

/** Longest excerpt of a value quoted back in a message. */
const QUOTE_MAX = 60

export type ImportParseWarning =
  | { kind: 'array-value'; key: string; line: number }
  | { kind: 'unsupported-value'; key: string; line: number }
  | { kind: 'missing-key'; row: number }
  | {
      kind: 'key-trimmed'
      /** The key as the file spells it. */
      written: string
      key: string
      /** JSON line or sheet row. */
      at: number
      unit: 'line' | 'row'
    }

export type ImportJsonDefinition = {
  line: number
  text: string
  /** The key as written, spaces and all — for a nested one, the joined path. */
  written: string
  /** Path segments when the key came from nesting; null for a key written in one piece. */
  nested: string[] | null
}

export type ImportJsonDuplicate = {
  kind: 'json'
  key: string
  /** In file order; the last is the one imported. */
  definitions: ImportJsonDefinition[]
}

export type ImportSheetCell = {
  /** Column header. */
  label: string
  kept: { row: number; text: string }
  /** Earlier values in this column that differ from the kept one. */
  dropped: Array<{ row: number; text: string }>
}

export type ImportSheetDuplicate = {
  kind: 'sheet'
  key: string
  rows: number[]
  /** Only the columns whose values disagree; an empty list means nothing was lost. */
  cells: ImportSheetCell[]
}

export type ImportDuplicate = ImportJsonDuplicate | ImportSheetDuplicate

export type ImportParsed = {
  entries: Record<string, string>
  warnings: ImportParseWarning[]
  duplicates: ImportJsonDuplicate[]
}

function quote(text: string): string {
  const excerpt =
    text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX)}…` : text
  return `"${excerpt}"`
}

/** `a`, `a and b`, `a, b and c`. */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function timesText(count: number): string {
  return count === 2 ? 'twice' : `${count} times`
}

export function importWarningText(warning: ImportParseWarning): string {
  switch (warning.kind) {
    case 'array-value':
      return `"${warning.key}" (line ${warning.line}) is an array and was skipped.`
    case 'unsupported-value':
      return `"${warning.key}" (line ${warning.line}) is not text and was skipped.`
    case 'missing-key':
      return `Row ${warning.row} has text but no key and was skipped.`
    case 'key-trimmed':
      return `"${warning.written}" (${warning.unit} ${warning.at}) has spaces at the start or end and is imported as "${warning.key}".`
    default: {
      const unreachable: never = warning
      return unreachable
    }
  }
}

/** True when every definition carries the same text, so choosing one loses nothing. */
export function isLosslessDuplicate(duplicate: ImportDuplicate): boolean {
  switch (duplicate.kind) {
    case 'json': {
      const [first, ...rest] = duplicate.definitions
      return rest.every((definition) => definition.text === first?.text)
    }
    case 'sheet':
      return duplicate.cells.length === 0
    default: {
      const unreachable: never = duplicate
      return unreachable
    }
  }
}

/** A sheet duplicate as seen through the columns actually imported. */
export function restrictSheetDuplicate(
  duplicate: ImportSheetDuplicate,
  labels: ReadonlySet<string>
): ImportSheetDuplicate {
  return {
    ...duplicate,
    cells: duplicate.cells.filter((cell) => labels.has(cell.label)),
  }
}

function describeJsonDefinition(definition: ImportJsonDefinition): string {
  return definition.nested
    ? `line ${definition.line} as nested keys (${definition.nested.join(' → ')})`
    : `line ${definition.line} as the key "${definition.written}"`
}

/**
 * One sentence per duplicate. A JSON key spelled the same way every time only
 * needs its lines; one that arrived by different routes — nesting, a dotted
 * key, stray spaces — says which route each line took, or the user searches
 * the file for the key and finds a single hit.
 */
export function importDuplicateText(duplicate: ImportDuplicate): string {
  switch (duplicate.kind) {
    case 'json': {
      const { key, definitions } = duplicate
      const kept = definitions.at(-1)!.text
      const which = definitions.length === 2 ? 'The later one' : 'The last one'
      const sameSpelling = definitions.every(
        (definition) => !definition.nested && definition.written === key
      )
      const where = sameSpelling
        ? `(lines ${definitions.map((definition) => definition.line).join(', ')})`
        : `: ${definitions.map(describeJsonDefinition).join(', ')}`
      return `"${key}" is defined ${timesText(definitions.length)}${sameSpelling ? ' ' : ''}${where}. ${which} is kept: ${quote(kept)}.`
    }
    case 'sheet': {
      const rows = `rows ${listJoin(duplicate.rows.map(String))}`
      if (!duplicate.cells.length) {
        return `"${duplicate.key}" is on ${rows} with identical text.`
      }
      const cells = duplicate.cells
        .map((cell) => `${cell.label} ${quote(cell.kept.text)} (row ${cell.kept.row})`)
        .join(', ')
      return `"${duplicate.key}" is on ${rows}. Each locale keeps its last non-empty cell: ${cells}.`
    }
    default: {
      const unreachable: never = duplicate
      return unreachable
    }
  }
}

/** The values that lose, for showing struck through beside the sentence. */
export function importDuplicateDropped(duplicate: ImportDuplicate): string[] {
  switch (duplicate.kind) {
    case 'json': {
      const kept = duplicate.definitions.at(-1)!.text
      return duplicate.definitions
        .slice(0, -1)
        .filter((definition) => definition.text !== kept)
        .map((definition) => `${quote(definition.text)} (line ${definition.line})`)
    }
    case 'sheet':
      return duplicate.cells.flatMap((cell) =>
        cell.dropped.map(
          (dropped) => `${cell.label} ${quote(dropped.text)} (row ${dropped.row})`
        )
      )
    default: {
      const unreachable: never = duplicate
      return unreachable
    }
  }
}

/**
 * The text to store, or null for "no translation". Only line endings and the
 * ends are touched: inner whitespace is copy, and the fingerprint already
 * ignores it for matching.
 */
export function normalizeImportText(value: unknown): string | null {
  let text: string
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value)
  else if (typeof value === 'boolean') text = String(value)
  else return null
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  return normalized === '' ? null : normalized
}

/** No prototype, so a key named `__proto__` is stored like any other. */
export function emptyEntries(): Record<string, string> {
  return Object.create(null) as Record<string, string>
}

/** 1-based line of each offset, by binary search over the line starts. */
function lineLocator(source: string): (offset: number) => number {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') starts.push(index + 1)
  }
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (starts[middle]! <= offset) low = middle
      else high = middle - 1
    }
    return low + 1
  }
}

/**
 * Parses one locale file into `a.b.c` keys. Always `.`, whatever the project's
 * separator: that is the path the calling code already passes to `t()`, and a
 * `_` join would fold `{a:{b_c}}` and `{a_b:{c}}` into one key.
 *
 * Read as a syntax tree rather than with `JSON.parse`, which keeps only the
 * last of two identical property names and so hides the duplicate entirely.
 * Comments and trailing commas are tolerated: locale files are often JSONC.
 */
export function parseLocaleJson(source: string): ImportParsed {
  const lineOf = lineLocator(source)
  const errors: ParseError[] = []
  const root = parseTree(source, errors, { allowTrailingComma: true })
  const firstError = errors[0]
  if (firstError) {
    throw new Error(
      `Invalid JSON at line ${lineOf(firstError.offset)} (${printParseErrorCode(firstError.error)})`
    )
  }
  if (root?.type !== 'object') {
    throw new Error('The JSON file must contain an object at the top level')
  }

  const warnings: ImportParseWarning[] = []
  const byKey = new Map<string, ImportJsonDefinition[]>()

  const walk = (node: JsonNode, path: string[]) => {
    for (const property of node.children ?? []) {
      const [nameNode, valueNode] = property.children ?? []
      if (!nameNode || !valueNode) continue
      const segments = [...path, String(nameNode.value)]
      const written = segments.join(IMPORT_KEY_SEPARATOR)
      const line = lineOf(property.offset)
      switch (valueNode.type) {
        case 'object':
          walk(valueNode, segments)
          break
        case 'array':
          warnings.push({ kind: 'array-value', key: written, line })
          break
        case 'null':
          break
        case 'property':
          warnings.push({ kind: 'unsupported-value', key: written, line })
          break
        case 'string':
        case 'number':
        case 'boolean': {
          const text = normalizeImportText(valueNode.value)
          if (text === null) break
          const key = written.trim()
          const definitions = byKey.get(key) ?? []
          definitions.push({
            line,
            text,
            written,
            nested: segments.length > 1 ? segments : null,
          })
          byKey.set(key, definitions)
          break
        }
        default: {
          const unreachable: never = valueNode.type
          throw new Error(`Unknown JSON node type: ${unreachable}`)
        }
      }
    }
  }
  walk(root, [])

  const entries = emptyEntries()
  const duplicates: ImportJsonDuplicate[] = []
  for (const [key, definitions] of byKey) {
    entries[key] = definitions.at(-1)!.text
    if (definitions.length > 1) {
      duplicates.push({ kind: 'json', key, definitions })
      continue
    }
    const only = definitions[0]!
    if (only.written !== key) {
      warnings.push({
        kind: 'key-trimmed',
        written: only.written,
        key,
        at: only.line,
        unit: 'line',
      })
    }
  }
  return { entries, warnings, duplicates }
}

function normalizeLocaleLabel(label: string): string {
  return label.trim().toLowerCase().replace(/-/g, '_')
}

/** `zh-CN.json` → `zh-CN`. Only the last extension goes; `messages.en.json` → `messages.en`. */
export function localeLabelFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/**
 * A best guess at which project locale a file name or column header means, or
 * null when there is no single answer. The user confirms every mapping, so a
 * wrong guess costs a click; an ambiguous one (`zh` against `zh_cn` + `zh_tw`)
 * is left for them rather than picked.
 */
export function guessLocale(label: string, projectLocales: string[]): string | null {
  const wanted = normalizeLocaleLabel(label)
  if (!wanted) return null

  const exact = projectLocales.find(
    (locale) => normalizeLocaleLabel(locale) === wanted
  )
  if (exact) return exact

  const byName = TRANSLATION_LANGUAGES.find(
    (language) => language.label.toLowerCase() === wanted
  )
  if (byName && projectLocales.includes(byName.value)) return byName.value

  const base = wanted.split('_')[0]!
  const sameBase = projectLocales.filter((locale) => {
    const normalized = normalizeLocaleLabel(locale)
    return normalized === base || normalized.split('_')[0] === base
  })
  return sameBase.length === 1 ? sameBase[0]! : null
}

export type ImportSheetColumn = {
  /** Header text, what the user maps to a locale. */
  label: string
  entries: Record<string, string>
}

export type ImportSheetResult =
  | {
      ok: true
      columns: ImportSheetColumn[]
      warnings: ImportParseWarning[]
      duplicates: ImportSheetDuplicate[]
    }
  | { ok: false; reason: 'empty' | 'no-key-column' }

function rawCellText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  return String(cell)
}

/**
 * Reads a sheet already turned into rows of cells (SheetJS `header: 1`). The
 * first row is the header; the column named `key` holds the keys and every
 * other named column is a locale candidate. A Localness export's `id`,
 * `key_id` and `pic` columns are dropped, so a sheet exported here and
 * translated elsewhere reads back like any other.
 *
 * Repeated keys merge cell by cell — each column keeps its last non-empty
 * value — so an empty cell on a later row never erases an earlier translation.
 */
export function readXlsxSheet(rows: unknown[][]): ImportSheetResult {
  const [header, ...body] = rows
  if (!header?.length) return { ok: false, reason: 'empty' }

  const labels = header.map((cell) => rawCellText(cell).trim())
  const keyColumn = labels.findIndex((label) => label.toLowerCase() === 'key')
  if (keyColumn < 0) return { ok: false, reason: 'no-key-column' }

  const columns: Array<{ label: string; index: number }> = []
  labels.forEach((label, index) => {
    if (index === keyColumn || !label) return
    if (NON_LOCALE_COLUMNS.has(label.toLowerCase())) return
    columns.push({ label, index })
  })

  const warnings: ImportParseWarning[] = []
  const rowsByKey = new Map<string, number[]>()
  const firstWritten = new Map<string, { written: string; row: number }>()
  /** Per column, per key: every non-empty value in row order. */
  const valuesByColumn = columns.map(
    () => new Map<string, Array<{ row: number; text: string }>>()
  )

  body.forEach((cells, offset) => {
    // Row 1 is the header, and SheetJS rows are zero-based.
    const row = offset + 2
    const written = rawCellText(cells?.[keyColumn])
    const key = written.trim()
    const texts = columns.map((column) => normalizeImportText(cells?.[column.index]))
    if (!key) {
      if (texts.some((text) => text !== null)) {
        warnings.push({ kind: 'missing-key', row })
      }
      return
    }
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row])
    if (!firstWritten.has(key)) firstWritten.set(key, { written, row })
    texts.forEach((text, column) => {
      if (text === null) return
      const values = valuesByColumn[column]!
      values.set(key, [...(values.get(key) ?? []), { row, text }])
    })
  })

  const result: ImportSheetColumn[] = columns.map((column, index) => {
    const entries = emptyEntries()
    for (const [key, values] of valuesByColumn[index]!) {
      entries[key] = values.at(-1)!.text
    }
    return { label: column.label, entries }
  })

  const duplicates: ImportSheetDuplicate[] = []
  for (const [key, keyRows] of rowsByKey) {
    if (keyRows.length === 1) {
      const first = firstWritten.get(key)!
      if (first.written !== key) {
        warnings.push({
          kind: 'key-trimmed',
          written: first.written,
          key,
          at: first.row,
          unit: 'row',
        })
      }
      continue
    }
    const cells: ImportSheetCell[] = []
    columns.forEach((column, index) => {
      const values = valuesByColumn[index]!.get(key) ?? []
      const kept = values.at(-1)
      if (!kept) return
      const dropped = values
        .slice(0, -1)
        .filter((value) => value.text !== kept.text)
      if (dropped.length) cells.push({ label: column.label, kept, dropped })
    })
    duplicates.push({ kind: 'sheet', key, rows: keyRows, cells })
  }

  return { ok: true, columns: result, warnings, duplicates }
}

export type LocaleOverlap = {
  level: 'warning' | 'info'
  text: string
}

/**
 * What mapping several files (or sheet columns) onto one locale does. Said in
 * numbers, because the answer ranges from "nothing to worry about" to "some
 * translations are silently replaced", and only the numbers tell which.
 */
export function describeLocaleOverlap(
  locale: string,
  sources: Array<{ label: string; entries: Record<string, string> }>
): LocaleOverlap {
  const values = new Map<string, string[]>()
  for (const source of sources) {
    for (const [key, text] of Object.entries(source.entries)) {
      values.set(key, [...(values.get(key) ?? []), text])
    }
  }
  let shared = 0
  let differing = 0
  for (const texts of values.values()) {
    if (texts.length < 2) continue
    shared += 1
    if (texts.some((text) => text !== texts[0])) differing += 1
  }

  const pair = sources.length === 2
  const names = listJoin(sources.map((source) => source.label))
  const lead = `${names} ${pair ? 'both' : 'all'} map to ${locale}.`
  const inBoth = pair ? 'in both' : 'in more than one'

  if (differing) {
    const winner = pair
      ? `${sources[1]!.label} (lower in the list)`
      : 'the lowest one in the list that has the key'
    return {
      level: 'warning',
      text: `${lead} ${countOf(shared, 'key')} ${shared === 1 ? 'is' : 'are'} ${inBoth}, ${differing} with different text — for those, ${winner} wins.`,
    }
  }
  if (shared) {
    return {
      level: 'info',
      text: `${lead} They share ${countOf(shared, 'key')}, all with identical text.`,
    }
  }
  return {
    level: 'info',
    text: `${lead} No key is ${inBoth}, so they are simply combined.`,
  }
}

export type InterpolationStyle = 'single-brace' | 'double-brace'

const DOUBLE_BRACE = /\{\{\s*[\w.-]+\s*\}\}/
/** `{name}` that is not half of a `{{name}}`. ICU `{n, plural, …}` has a comma, so it is not matched. */
const SINGLE_BRACE = /(?:^|[^{])\{\s*[\w.-]+\s*\}(?!\})/

/**
 * Which placeholder syntaxes appear. More than one means the file mixes
 * vue-i18n (`{name}`) and i18next (`{{name}}`) copy, which one runtime will
 * render literally.
 */
export function detectInterpolationStyles(
  texts: Iterable<string>
): InterpolationStyle[] {
  let single = false
  let double = false
  for (const text of texts) {
    if (!double && DOUBLE_BRACE.test(text)) double = true
    if (!single && SINGLE_BRACE.test(text)) single = true
    if (single && double) break
  }
  const styles: InterpolationStyle[] = []
  if (single) styles.push('single-brace')
  if (double) styles.push('double-brace')
  return styles
}
