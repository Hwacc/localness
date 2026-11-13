import { describe, expect, it } from 'vitest'
import { parseSkillAgents } from '#server/helper/project-skill'
import {
  customAgentFilter,
  normalizeSkillAgents,
  readSkillAgents,
  skillAgentMatches,
} from '#shared/utils/skill-agents'

describe('normalizeSkillAgents', () => {
  it('treats a missing value as unlabelled', () => {
    expect(normalizeSkillAgents(undefined)).toEqual({ ids: [], custom: [] })
  })

  it('orders preset ids and trims custom names', () => {
    expect(
      normalizeSkillAgents({
        ids: ['cursor', 'claude-code'],
        custom: ['  Windsurf  ', ''],
      })
    ).toEqual({ ids: ['claude-code', 'cursor'], custom: ['Windsurf'] })
  })

  it('turns a custom name that names a preset into that preset', () => {
    expect(
      normalizeSkillAgents({ ids: [], custom: ['github copilot', 'CURSOR'] })
    ).toEqual({ ids: ['github-copilot', 'cursor'], custom: [] })
  })

  it('collapses duplicate custom names case-insensitively', () => {
    expect(
      normalizeSkillAgents({ custom: ['Windsurf', 'windsurf'] }).custom
    ).toEqual(['Windsurf'])
  })

  it('rejects General combined with anything else', () => {
    expect(() =>
      normalizeSkillAgents({ ids: ['general', 'cursor'] })
    ).toThrow(/General/)
    expect(() =>
      normalizeSkillAgents({ ids: ['general'], custom: ['Windsurf'] })
    ).toThrow(/General/)
    expect(normalizeSkillAgents({ ids: ['general'] }).ids).toEqual(['general'])
  })

  it('enforces the custom name length and count limits', () => {
    expect(() => normalizeSkillAgents({ custom: ['x'.repeat(25)] })).toThrow()
    expect(normalizeSkillAgents({ custom: ['x'.repeat(24)] }).custom).toHaveLength(1)
    expect(() =>
      normalizeSkillAgents({ custom: ['a', 'b', 'c', 'd', 'e', 'f'] })
    ).toThrow(/At most 5/)
  })

  it('rejects unknown ids and malformed input', () => {
    expect(() => normalizeSkillAgents({ ids: ['windsurf'] })).toThrow(/Unknown/)
    expect(() => normalizeSkillAgents({ ids: 'cursor' })).toThrow()
    expect(() => normalizeSkillAgents(['cursor'])).toThrow()
  })

  it('surfaces as a 400 on the server', () => {
    expect(() => parseSkillAgents({ ids: ['nope'] })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    )
  })
})

describe('readSkillAgents', () => {
  it('never throws on stored junk', () => {
    expect(readSkillAgents(null)).toEqual({ ids: [], custom: [] })
    expect(readSkillAgents({ ids: ['cursor', 3], custom: 'x' })).toEqual({
      ids: ['cursor'],
      custom: [],
    })
  })
})

describe('skillAgentMatches', () => {
  const cursor = { ids: ['cursor'], custom: ['Windsurf'] }
  const general = { ids: ['general'], custom: [] }
  const none = { ids: [], custom: [] }

  it('matches presets and custom names', () => {
    expect(skillAgentMatches(cursor, 'cursor')).toBe(true)
    expect(skillAgentMatches(cursor, 'claude-code')).toBe(false)
    expect(skillAgentMatches(cursor, customAgentFilter('WINDSURF'))).toBe(true)
  })

  it('lets a General skill match every agent', () => {
    expect(skillAgentMatches(general, 'claude-code')).toBe(true)
    expect(skillAgentMatches(general, customAgentFilter('Windsurf'))).toBe(true)
  })

  it('hides unlabelled skills under an agent filter only', () => {
    expect(skillAgentMatches(none, null)).toBe(true)
    expect(skillAgentMatches(none, 'cursor')).toBe(false)
  })
})
