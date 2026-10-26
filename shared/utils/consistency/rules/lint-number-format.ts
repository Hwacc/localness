import type { ConsistencyRule } from '../types'
import {
  judgedNumbers,
  numberRaws,
  violatesLocale,
} from '../number-format'
import { detectLint } from './_lint'

/**
 * Each published text against its own language's way of writing numbers: `1.5`
 * in German, `1,234.56` in French. A key's published source text supplies the
 * one case a reader cannot judge alone — a lone `1.000` copied verbatim into a
 * language that reads the separator the other way.
 */
export const lintNumberFormatRule: ConsistencyRule = {
  id: 'lint.number-format',
  defaultSeverity: 'warning',
  category: 'lint',
  granularity: 'key',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintNumberFormatRule,
      () => true,
      (text, locale, key) => {
        const sourceText =
          key.locales.find((row) => row.locale === ctx.sourceLocale)
            ?.publishedText ?? ''
        const source = {
          locale: ctx.sourceLocale,
          raws: numberRaws(sourceText),
        }
        const hit = judgedNumbers(text).find((token) =>
          violatesLocale(token.raw, locale, source)
        )
        return hit
          ? { excerpt: hit.raw, start: hit.start, end: hit.end }
          : null
      }
    ),
}
