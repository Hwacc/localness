import type { ConsistencyRule } from '../types'
import { detectTokenMismatches } from './_mismatch'
import { extractUrlsEmails } from './extract'

export const urlsEmailsRule: ConsistencyRule = {
  id: 'urls-emails',
  defaultSeverity: 'error',
  category: 'mismatch',
  detect: (ctx) => detectTokenMismatches(ctx, urlsEmailsRule, extractUrlsEmails),
}
