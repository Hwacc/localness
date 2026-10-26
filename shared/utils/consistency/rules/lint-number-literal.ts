import type { ConsistencyRule } from '../types'
import { isGroupedLiteral, judgedNumbers } from '../number-format'
import { detectLint } from './_lint'

/**
 * A number typed into the source text with thousands separators. Every
 * translation has to retype it in its own convention; a `{count}` formatted at
 * runtime (`Intl.NumberFormat`) is written once and right everywhere.
 */
export const lintNumberLiteralRule: ConsistencyRule = {
  id: 'lint.number-literal',
  defaultSeverity: 'info',
  category: 'lint',
  granularity: 'key',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintNumberLiteralRule,
      (locale) => locale === ctx.sourceLocale,
      (text, locale) => {
        const hit = judgedNumbers(text).find((token) =>
          isGroupedLiteral(token.raw, locale)
        )
        return hit
          ? { excerpt: hit.raw, start: hit.start, end: hit.end }
          : null
      }
    ),
}
