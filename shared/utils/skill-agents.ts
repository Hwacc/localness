import {
  SKILL_AGENT_CUSTOM_ICON,
  SKILL_AGENT_GENERAL,
  SKILL_AGENT_GENERAL_ICON,
  SKILL_AGENTS,
  SKILL_CUSTOM_AGENT_MAX,
  SKILL_CUSTOM_AGENT_MAX_LEN,
} from '../constants/skill-agents'

/**
 * A skill's "Works with" tags. `ids` are preset ids or `general`; `custom` are
 * names the maintainer typed. Both empty = not labelled.
 */
export type SkillAgents = {
  ids: string[]
  custom: string[]
}

export interface SkillAgentChip {
  key: string
  name: string
  icon: string
}

const PRESET_ORDER = new Map<string, number>(
  SKILL_AGENTS.map((agent, index) => [agent.id, index])
)

function presetFor(name: string) {
  const lower = name.toLowerCase()
  return SKILL_AGENTS.find(
    (agent) => agent.id === lower || agent.name.toLowerCase() === lower
  )
}

function stringArray(raw: unknown, field: string): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
    throw new Error(`Works with: ${field} must be a list of names`)
  }
  return raw as string[]
}

/**
 * Validate and canonicalise what the Skill modal sends. Custom names that
 * match a preset become that preset; duplicates collapse case-insensitively.
 * Throws with a user-facing message on anything the modal would not allow.
 */
export function normalizeSkillAgents(raw: unknown): SkillAgents {
  if (raw == null) return { ids: [], custom: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Works with is invalid')
  }
  const input = raw as { ids?: unknown; custom?: unknown }
  const ids = new Set<string>()
  for (const id of stringArray(input.ids, 'ids')) {
    if (id !== SKILL_AGENT_GENERAL && !PRESET_ORDER.has(id)) {
      throw new Error(`Unknown agent "${id}"`)
    }
    ids.add(id)
  }

  const custom: string[] = []
  const seen = new Set<string>()
  for (const value of stringArray(input.custom, 'custom')) {
    const name = value.trim()
    if (!name) continue
    if (name.length > SKILL_CUSTOM_AGENT_MAX_LEN) {
      throw new Error(
        `Custom agent names are at most ${SKILL_CUSTOM_AGENT_MAX_LEN} characters`
      )
    }
    const preset = presetFor(name)
    if (preset) {
      ids.add(preset.id)
      continue
    }
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    custom.push(name)
  }
  if (custom.length > SKILL_CUSTOM_AGENT_MAX) {
    throw new Error(`At most ${SKILL_CUSTOM_AGENT_MAX} custom agents`)
  }

  if (ids.has(SKILL_AGENT_GENERAL) && (ids.size > 1 || custom.length)) {
    throw new Error('General cannot be combined with other agents')
  }
  return {
    ids: [...ids].sort(
      (a, b) => (PRESET_ORDER.get(a) ?? -1) - (PRESET_ORDER.get(b) ?? -1)
    ),
    custom,
  }
}

/** Tolerant read of a stored value: keeps any strings, never throws. */
export function readSkillAgents(raw: unknown): SkillAgents {
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  if (!raw || typeof raw !== 'object') return { ids: [], custom: [] }
  const input = raw as { ids?: unknown; custom?: unknown }
  return { ids: strings(input.ids), custom: strings(input.custom) }
}

/** Filter value for a custom name; preset filters use the preset id. */
export function customAgentFilter(name: string) {
  return `custom:${name.toLowerCase()}`
}

/** A General skill matches every agent filter — it works with any of them. */
export function skillAgentMatches(agents: SkillAgents, filter: string | null) {
  if (!filter) return true
  if (agents.ids.includes(SKILL_AGENT_GENERAL)) return true
  if (filter.startsWith('custom:')) {
    return agents.custom.some((name) => customAgentFilter(name) === filter)
  }
  return agents.ids.includes(filter)
}

/** Chips for display; an id no longer in the presets falls back to the bot icon. */
export function skillAgentChips(agents: SkillAgents): SkillAgentChip[] {
  const presets: SkillAgentChip[] = agents.ids.map((id) => {
    if (id === SKILL_AGENT_GENERAL) {
      return { key: id, name: 'General', icon: SKILL_AGENT_GENERAL_ICON }
    }
    const preset = SKILL_AGENTS.find((agent) => agent.id === id)
    return preset
      ? { key: id, name: preset.name, icon: preset.icon }
      : { key: id, name: id, icon: SKILL_AGENT_CUSTOM_ICON }
  })
  return [
    ...presets,
    ...agents.custom.map((name) => ({
      key: customAgentFilter(name),
      name,
      icon: SKILL_AGENT_CUSTOM_ICON,
    })),
  ]
}
