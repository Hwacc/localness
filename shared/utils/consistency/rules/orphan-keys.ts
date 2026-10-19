import { singleKeyGroupId } from '../group-id'
import type { ConsistencyFinding, ConsistencyRule } from '../types'
import { toMember } from '../types'

/**
 * Dictionary entries no frame references. Info-only on purpose (拍板 5): a
 * key created via New translation or an import legitimately has zero tags, so
 * this surfaces leftovers, never faults. Placeholder keys are included — an
 * unreferenced `__draft_` is exactly the residue worth seeing.
 */
export const orphanKeysRule: ConsistencyRule = {
  id: 'orphan-keys',
  defaultSeverity: 'info',
  category: 'orphan',

  detect(ctx): ConsistencyFinding[] {
    return ctx.keys
      .filter((key) => key.tagCount === 0)
      .map((key) => ({
        ruleId: 'orphan-keys',
        severity: 'info' as const,
        category: 'orphan' as const,
        groupId: singleKeyGroupId('orphan-keys', key.keyId, key.sourceText),
        keys: [toMember(key)],
      }))
  },
}
