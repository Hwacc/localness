import { singleKeyGroupId } from '../group-id'
import type { ConsistencyFinding, ConsistencyRule } from '../types'
import { toMember } from '../types'

/**
 * Dictionary entries no frame references. Info-only on purpose (拍板 5): a
 * key created via New translation or an import legitimately has zero tags, so
 * this surfaces leftovers, never faults. Placeholder keys are included — an
 * unreferenced `__draft_` is exactly the residue worth seeing. An i18next
 * plural form counts as referenced when any sibling is (a frame shows one
 * form; `items_few` never gets its own).
 */
export const orphanKeysRule: ConsistencyRule = {
  id: 'orphan-keys',
  defaultSeverity: 'info',
  category: 'orphan',
  granularity: 'key',

  detect(ctx): ConsistencyFinding[] {
    return ctx.keys
      .filter((key) => key.tagCount === 0 && !key.pluralFamily?.tagged)
      .map((key) => ({
        ruleId: 'orphan-keys',
        severity: 'info' as const,
        category: 'orphan' as const,
        groupId: singleKeyGroupId('orphan-keys', key.keyId, key.sourceText),
        keys: [toMember(key)],
      }))
  },
}
