import type { ConsistencyRule } from '../types'
import { detectTokenMismatches } from './_mismatch'
import { extractPlaceholders } from './extract'

/** i18next fills `count` itself; a plural form may show it or not. */
const COUNT_TOKENS = new Set(['{{count}}', '{count}'])

export const placeholdersRule: ConsistencyRule = {
  id: 'placeholders',
  defaultSeverity: 'error',
  category: 'mismatch',
  detect: (ctx) =>
    detectTokenMismatches(ctx, placeholdersRule, extractPlaceholders, {
      pluralOptional: (token) => COUNT_TOKENS.has(token.value),
    }),
}
