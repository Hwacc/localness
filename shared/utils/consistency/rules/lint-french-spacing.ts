import type { ConsistencyRule } from '../types'
import { detectLint, firstMatch } from './_lint'

/** A plain space before these is the violation; U+00A0/U+202F are correct. */
const WRONG_SPACE = / [!?;:]/

export const lintFrenchSpacingRule: ConsistencyRule = {
  id: 'lint.french-spacing',
  defaultSeverity: 'info',
  category: 'lint',
  detect: (ctx) =>
    detectLint(
      ctx,
      lintFrenchSpacingRule,
      (locale) => locale.startsWith('fr'),
      (text) => firstMatch(WRONG_SPACE, text)
    ),
}
