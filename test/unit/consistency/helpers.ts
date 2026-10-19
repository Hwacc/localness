import type {
  ScanContext,
  ScanKeyInput,
  ScanKeyLocale,
} from '#shared/utils/consistency'

let nextId = 1

export function published(locale: string, text: string): ScanKeyLocale {
  return { locale, draftText: text, publishedText: text }
}

export function key(overrides: Partial<ScanKeyInput> = {}): ScanKeyInput {
  return {
    keyId: nextId++,
    key: `key_${nextId}`,
    tagCount: 1,
    sourceText: '',
    locales: [],
    ...overrides,
  }
}

export function ctx(
  keys: ScanKeyInput[],
  extra: Partial<ScanContext> = {}
): ScanContext {
  return {
    projectId: 1,
    sourceLocale: 'en',
    lintRules: {},
    keys,
    ...extra,
  }
}
