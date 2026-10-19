import type { ConsistencyRule } from '../types'
import { detectLint, firstMatch } from './_lint'

/** Unified ideographs, CJK ext A, kana, hangul. */
const CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3040-\\u30ff\\uac00-\\ud7af'

const ADJACENCY = new RegExp(`[${CJK}][A-Za-z0-9]|[A-Za-z0-9][${CJK}]`)

/**
 * Chinese only: the "space between CJK and Latin/digits" convention is a
 * Chinese style guide rule — Japanese writes `3件` / `Wi-Fi接続` with no space,
 * so applying it to ja floods the report with false positives.
 */
export const lintCjkSpacingRule: ConsistencyRule = {
  id: 'lint.cjk-spacing',
  defaultSeverity: 'info',
  category: 'lint',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintCjkSpacingRule,
      (locale) => locale.startsWith('zh'),
      (text) => firstMatch(ADJACENCY, text)
    ),
}
