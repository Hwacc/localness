import {
  applyEdits,
  modify,
  parseTree,
  printParseErrorCode,
  type JSONPath,
  type Node as JsonNode,
  type ParseError,
} from 'jsonc-parser'
import { GitSyncFileFormat } from '#shared/constants'
import {
  IMPORT_KEY_SEPARATOR,
  emptyEntries,
  normalizeImportText,
} from '#shared/utils/i18n-import'

/**
 * One `locale-files` JSON file. Keys are read the same way Translations import
 * reads them — nested objects joined with `.` — and every key remembers the
 * property path it came from, so a write lands on that exact property even in
 * a file that mixes flat and nested keys.
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
          const key = segments.join(IMPORT_KEY_SEPARATOR)
          paths.set(key, segments)
          const text = normalizeImportText(valueNode.value)
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

function newKeyPath(key: string, format: GitSyncFileFormat): string[] {
  switch (format) {
    case GitSyncFileFormat.FLAT_JSON:
      return [key]
    case GitSyncFileFormat.NESTED_JSON:
      return key.split(IMPORT_KEY_SEPARATOR)
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
  format: GitSyncFileFormat
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
 * its parent object. `source` null creates the file. Callers must drop
 * `unwritableKeys` first.
 */
export function writeLocaleFile(
  source: string | null,
  entries: Record<string, string>,
  format: GitSyncFileFormat
): string {
  let text = source ?? '{}\n'
  const file = readLocaleFile(text)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const formattingOptions = { ...detectIndent(text), eol }
  for (const [key, value] of Object.entries(entries)) {
    const path: JSONPath = file.paths.get(key) ?? newKeyPath(key, format)
    text = applyEdits(text, modify(text, path, value, { formattingOptions }))
  }
  return text.endsWith('\n') ? text : `${text}${eol}`
}
