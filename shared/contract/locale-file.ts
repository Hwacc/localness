import {
  applyEdits,
  findNodeAtLocation,
  modify,
  parseTree,
  printParseErrorCode,
  type JSONPath,
  type Node as JsonNode,
  type ParseError,
} from 'jsonc-parser'

/**
 * One JSON file per locale, as git-sync's `locale-files` layout and the
 * `localness` CLI read and write it. Both go through this module, so a file
 * written by either one is byte-for-byte what the other would write.
 *
 * Package subpath `@localness/contract/locale-file`.
 */

export const LOCALE_PLACEHOLDER = '{locale}'
export const DEFAULT_LOCALE_FILE_PATTERN = `${LOCALE_PLACEHOLDER}.json`

/** Nested JSON joins its path with this. */
export const LOCALE_KEY_SEPARATOR = '.'

/** Key layout a write uses for a new key. Reading accepts both. */
export const LocaleFileFormat = {
  FLAT_JSON: 'flat-json',
  NESTED_JSON: 'nested-json',
} as const
export type LocaleFileFormat = (typeof LocaleFileFormat)[keyof typeof LocaleFileFormat]

/**
 * The text to store, or null for "no translation". Only line endings and the
 * ends are touched: inner whitespace is copy.
 */
export function normalizeLocaleText(value: unknown): string | null {
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

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function validPath(path: string): boolean {
  return path.split('/').every((segment) => SEGMENT.test(segment))
}

/** Error text for an unusable directory / pattern, or null. */
export function localeFilesScopeError(dir: string, pattern: string): string | null {
  if (!validPath(dir)) {
    return 'Directory must be a relative path like src/locales'
  }
  if (pattern.split(LOCALE_PLACEHOLDER).length !== 2) {
    return `File pattern must contain ${LOCALE_PLACEHOLDER} exactly once`
  }
  if (!pattern.toLowerCase().endsWith('.json')) {
    return 'File pattern must end with .json'
  }
  if (!validPath(pattern.replace(LOCALE_PLACEHOLDER, 'en'))) {
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

/** `/`-separated path of a locale's file. `dir` must pass `localeFilesScopeError`. */
export function localeFilePath(
  dir: string,
  pattern: string,
  locale: string,
  localeMap: Record<string, string> | null
): string {
  return `${dir}/${pattern.replace(LOCALE_PLACEHOLDER, localeFileName(locale, localeMap))}`
}

/**
 * Keys are read the same way Translations import reads them — nested objects
 * joined with `.` — and every key remembers the property path it came from, so
 * a write lands on that exact property even in a file that mixes flat and
 * nested keys.
 */
export type LocaleFileContent = {
  entries: Record<string, string>
  paths: Map<string, string[]>
  /** Paths holding something other than an object or text (arrays, null). */
  blocked: string[][]
}

export function readLocaleFile(source: string): LocaleFileContent {
  const errors: ParseError[] = []
  const root = parseTree(source, errors, { allowTrailingComma: true })
  const first = errors[0]
  if (first) throw new Error(`Invalid JSON (${printParseErrorCode(first.error)})`)
  if (root?.type !== 'object') {
    throw new Error('The JSON file must contain an object at the top level')
  }
  const entries = emptyEntries()
  const paths = new Map<string, string[]>()
  const blocked: string[][] = []
  const walk = (node: JsonNode, path: string[]) => {
    for (const property of node.children ?? []) {
      const [nameNode, valueNode] = property.children ?? []
      if (!nameNode || !valueNode) continue
      const segments = [...path, String(nameNode.value)]
      switch (valueNode.type) {
        case 'object':
          walk(valueNode, segments)
          break
        case 'string':
        case 'number':
        case 'boolean': {
          const key = segments.join(LOCALE_KEY_SEPARATOR)
          paths.set(key, segments)
          const text = normalizeLocaleText(valueNode.value)
          if (text !== null) entries[key] = text
          break
        }
        case 'array':
        case 'null':
        case 'property':
          blocked.push(segments)
          break
        default: {
          const unreachable: never = valueNode.type
          throw new Error(`Unknown JSON node type: ${unreachable}`)
        }
      }
    }
  }
  walk(root, [])
  return { entries, paths, blocked }
}

function isPrefix(a: string[], b: string[]): boolean {
  return a.length <= b.length && a.every((segment, i) => segment === b[i])
}

function newKeyPath(key: string, format: LocaleFileFormat): string[] {
  switch (format) {
    case LocaleFileFormat.FLAT_JSON:
      return [key]
    case LocaleFileFormat.NESTED_JSON:
      return key.split(LOCALE_KEY_SEPARATOR)
    default: {
      const unreachable: never = format
      return unreachable
    }
  }
}

/**
 * Keys a write cannot place. A key already in the file is always writable, in
 * place. A new nested key is not when its path runs into an existing value
 * (`a` is text, so `a.b` has nowhere to go), would replace an object, has an
 * empty segment, or collides that way with another new key — then neither of
 * the two is written, since there is no right one to pick.
 */
export function unwritableKeys(
  file: LocaleFileContent,
  keys: string[],
  format: LocaleFileFormat
): Set<string> {
  const out = new Set<string>()
  const occupied = [...file.paths.values(), ...file.blocked]
  const fresh = keys
    .filter((key) => !file.paths.has(key))
    .map((key) => ({ key, path: newKeyPath(key, format) }))
  for (const item of fresh) {
    if (item.path.some((segment) => segment === '')) {
      out.add(item.key)
      continue
    }
    const hitsFile = occupied.some(
      (path) => isPrefix(path, item.path) || isPrefix(item.path, path)
    )
    const hitsFresh = fresh.some(
      (other) =>
        other.key !== item.key &&
        (isPrefix(other.path, item.path) || isPrefix(item.path, other.path))
    )
    if (hitsFile || hitsFresh) out.add(item.key)
  }
  return out
}

function detectIndent(source: string): { insertSpaces: boolean; tabSize: number } {
  const indent = source.match(/^[ \t]+(?=\S)/m)?.[0]
  if (!indent) return { insertSpaces: true, tabSize: 2 }
  if (indent.startsWith('\t')) return { insertSpaces: false, tabSize: 1 }
  return { insertSpaces: true, tabSize: indent.length }
}

/**
 * Sets each entry in place and leaves everything else byte-for-byte: key
 * order, indentation, comments and line endings. A new key goes to the end of
 * its parent object. A `null` value removes the key. `source` null creates the
 * file. Callers must drop `unwritableKeys` first.
 */
export function writeLocaleFile(
  source: string | null,
  entries: Record<string, string | null>,
  format: LocaleFileFormat
): string {
  let text = source ?? '{}\n'
  const file = readLocaleFile(text)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const formattingOptions = { ...detectIndent(text), eol }
  const set = (path: JSONPath, value: string | undefined) => {
    text = applyEdits(text, modify(text, path, value, { formattingOptions }))
  }
  for (const [key, value] of Object.entries(entries)) {
    const known = file.paths.get(key)
    if (value !== null) {
      set(known ?? newKeyPath(key, format), value)
      continue
    }
    if (!known) continue
    set(known, undefined)
    // A nested object the removal left empty goes too, up to the top level.
    for (let depth = known.length - 1; depth > 0; depth--) {
      const parent = known.slice(0, depth)
      const node = findNodeAtLocation(parseTree(text)!, parent)
      if (node?.type !== 'object' || node.children?.length) break
      set(parent, undefined)
    }
  }
  return text.endsWith('\n') ? text : `${text}${eol}`
}
