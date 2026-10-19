import { describe, expect, it } from 'vitest'
import {
  allRules,
  categorySections,
  detectAll,
} from '#shared/utils/consistency'
import { ctx, key, published } from './helpers'

describe('rule registry', () => {
  it('exposes every category with a title and description', () => {
    for (const category of ['duplicate', 'mismatch', 'lint', 'orphan'] as const) {
      expect(categorySections[category].title).toBeTruthy()
      expect(categorySections[category].description).toBeTruthy()
    }
  })

  it('gives every rule a unique id and a registered category', () => {
    const ids = allRules.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const rule of allRules) {
      expect(categorySections[rule.category]).toBeDefined()
    }
  })

  it('detectAll aggregates findings across rule categories', () => {
    const findings = detectAll(
      ctx([
        key({ sourceText: 'Save', tagCount: 0 }),
        key({ sourceText: 'Save', tagCount: 1 }),
        key({
          sourceText: 'Hi {name}...',
          tagCount: 1,
          locales: [
            published('en', 'Hi {name}...'),
            published('ja', 'こんにちは...'),
          ],
        }),
      ])
    )
    const categories = new Set(findings.map((finding) => finding.category))
    expect(categories).toContain('duplicate')
    expect(categories).toContain('mismatch')
    expect(categories).toContain('lint')
    expect(categories).toContain('orphan')
  })
})
