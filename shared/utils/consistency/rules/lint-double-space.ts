import type { ConsistencyRule } from '../types'
import { detectLint, firstMatch } from './_lint'

export const lintDoubleSpaceRule: ConsistencyRule = {
  id: 'lint.double-space',
  defaultSeverity: 'info',
  category: 'lint',
  granularity: 'key',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintDoubleSpaceRule,
      () => true,
      (text) => firstMatch(/ {2,}/, text)
    ),
}
