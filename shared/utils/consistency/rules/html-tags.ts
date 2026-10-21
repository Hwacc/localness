import type { ConsistencyRule } from '../types'
import { detectTokenMismatches } from './_mismatch'
import { extractTags } from './extract'

export const htmlTagsRule: ConsistencyRule = {
  id: 'html-tags',
  defaultSeverity: 'error',
  category: 'mismatch',
  granularity: 'key',
  detect: (ctx) => detectTokenMismatches(ctx, htmlTagsRule, extractTags),
}
