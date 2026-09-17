import { describe, expect, it } from 'vitest'
import {
  assertSkillMaintainer,
  assertSkillNameFree,
  assertSkillStorageKey,
  parseSkillDescription,
  parseSkillName,
  shapeProjectSkill,
} from '#server/helper/project-skill'
import { zipListsSkillMd } from '#shared/utils/skill-package'

function thrownStatus(fn: () => unknown): number | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

describe('parseSkillName', () => {
  it('trims a usable name', () => {
    expect(parseSkillName('  i18n-assistant  ')).toBe('i18n-assistant')
  })

  it('rejects a blank name', () => {
    expect(thrownStatus(() => parseSkillName('  '))).toBe(400)
  })
})

describe('parseSkillDescription', () => {
  it('rejects a blank description', () => {
    expect(thrownStatus(() => parseSkillDescription(''))).toBe(400)
  })
})

describe('assertSkillStorageKey', () => {
  it('accepts a skills/ uuid key', () => {
    expect(
      assertSkillStorageKey('skills/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.zip')
    ).toBe('skills/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.zip')
  })

  it('rejects a path that is not under skills/', () => {
    expect(thrownStatus(() => assertSkillStorageKey('pages/x.zip'))).toBe(400)
  })
})

describe('assertSkillMaintainer', () => {
  it('lets the creator through', () => {
    expect(() => assertSkillMaintainer({ createdBy: 3 }, 3)).not.toThrow()
  })

  it('forbids anyone else, including a steward acting as someone else', () => {
    expect(thrownStatus(() => assertSkillMaintainer({ createdBy: 3 }, 9))).toBe(
      403
    )
  })
})

describe('assertSkillNameFree', () => {
  it('conflicts when the name is taken', () => {
    expect(thrownStatus(() => assertSkillNameFree(true))).toBe(409)
  })
})

describe('shapeProjectSkill', () => {
  it('exposes the maintainer handle and never email', () => {
    const shaped = shapeProjectSkill({
      id: 1,
      name: 'i18n-assistant',
      description: 'Replace hardcoded copy',
      originalName: 'i18n-assistant.zip',
      createdBy: 4,
      createdAt: new Date('2026-09-17T00:00:00.000Z'),
      updatedAt: new Date('2026-09-17T00:00:00.000Z'),
      user: {
        username: 'bob',
        nickname: 'Bobby',
      },
    })
    expect(shaped.maintainerName).toBe('Bobby')
    expect(shaped.maintainerUsername).toBe('bob')
    expect(shaped).not.toHaveProperty('email')
  })
})

describe('zipListsSkillMd', () => {
  it('accepts SKILL.md at the root or one folder down', () => {
    expect(zipListsSkillMd(['SKILL.md', 'scripts/run.ts'])).toBe(true)
    expect(zipListsSkillMd(['i18n-assistant/SKILL.md'])).toBe(true)
  })

  it('rejects a deeper nest', () => {
    expect(zipListsSkillMd(['pkg/nested/SKILL.md'])).toBe(false)
  })
})
