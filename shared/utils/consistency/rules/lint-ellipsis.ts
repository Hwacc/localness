import type { ConsistencyRule } from '../types'
import { detectLint, firstMatch } from './_lint'

export const lintEllipsisRule: ConsistencyRule = {
  id: 'lint.ellipsis',
  defaultSeverity: 'info',
  category: 'lint',
  granularity: 'key',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintEllipsisRule,
      () => true,
      (text) => firstMatch(/\.{3,}/, text)
    ),
}
