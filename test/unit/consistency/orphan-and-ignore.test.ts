import { describe, expect, it } from 'vitest'
import { orphanKeysRule } from '#shared/utils/consistency/rules/orphan-keys'
import {
  partitionIgnored,
  type ConsistencyFinding,
} from '#shared/utils/consistency'
import { ctx, key } from './helpers'

describe('orphan-keys rule', () => {
  it('surfaces keys no frame references, as info', () => {
    const findings = orphanKeysRule.detect(
      ctx([key({ sourceText: 'Save', tagCount: 0 }), key({ sourceText: 'Go', tagCount: 1 })])
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]!.severity).toBe('info')
    expect(findings[0]!.keys[0]!.tagCount).toBe(0)
  })
})

describe('partitionIgnored (R2/R3)', () => {
  const finding = (
    ruleId: string,
    groupId: string,
    keyIds: number[]
  ): ConsistencyFinding => ({
    ruleId,
    severity: 'warning',
    category: 'duplicate',
    groupId,
    keys: keyIds.map((keyId) => ({
      keyId,
      key: `k${keyId}`,
      sourceText: 'x',
      tagCount: 1,
    })),
  })

  it('keeps a finding ignored while members stay inside the snapshot', () => {
    const { active, ignored } = partitionIgnored(
      [finding('duplicate-text', 'g1', [1, 2])],
      [{ ruleId: 'duplicate-text', groupId: 'g1', keyIds: [1, 2, 3] }]
    )
    expect(active).toHaveLength(0)
    expect(ignored).toHaveLength(1)
  })

  it('resurfaces when a new member joins the group (R2)', () => {
    const { active, ignored } = partitionIgnored(
      [finding('duplicate-text', 'g1', [1, 2, 9])],
      [{ ruleId: 'duplicate-text', groupId: 'g1', keyIds: [1, 2] }]
    )
    expect(active).toHaveLength(1)
    expect(ignored).toHaveLength(0)
  })

  it('shows findings with no whitelist row', () => {
    const { active } = partitionIgnored(
      [finding('duplicate-text', 'g2', [1])],
      []
    )
    expect(active).toHaveLength(1)
  })

  it('scopes by ruleId — same groupId under another rule stays visible', () => {
    const { active } = partitionIgnored(
      [finding('lint.ellipsis', 'g1', [1])],
      [{ ruleId: 'duplicate-text', groupId: 'g1', keyIds: [1] }]
    )
    expect(active).toHaveLength(1)
  })
})
