import type { ConsistencyRule } from '../types'
import { detectTokenMismatches } from './_mismatch'
import { extractNumbers } from './extract'

/**
 * A digit-free source is skipped: translations legitimately write words as
 * digits (`January` → `1月`, `first` → `第1`). Only a source that states a
 * number can have that number lost or changed.
 */
export const numbersRule: ConsistencyRule = {
  id: 'numbers',
  defaultSeverity: 'error',
  category: 'mismatch',
  detect: (ctx) =>
    detectTokenMismatches(ctx, numbersRule, extractNumbers, {
      skipTokenlessSource: true,
    }),
}
