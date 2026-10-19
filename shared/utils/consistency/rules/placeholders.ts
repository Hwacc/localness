import type { ConsistencyRule } from '../types'
import { detectTokenMismatches } from './_mismatch'
import { extractPlaceholders } from './extract'

export const placeholdersRule: ConsistencyRule = {
  id: 'placeholders',
  defaultSeverity: 'error',
  category: 'mismatch',
  detect: (ctx) =>
    detectTokenMismatches(ctx, placeholdersRule, extractPlaceholders),
}
