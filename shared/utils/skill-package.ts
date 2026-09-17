import { v4 as uuidv4 } from 'uuid'
import { SKILL_KEY_PREFIX } from '../constants'

export type SkillPackageExt = 'zip' | 'md' | 'skill'

export function skillPackageExt(filename: string): SkillPackageExt | null {
  const lower = filename.trim().toLowerCase()
  if (lower.endsWith('.skill')) return 'skill'
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.md')) return 'md'
  return null
}

export function newSkillStorageKey(filename: string): string {
  const ext = skillPackageExt(filename)
  if (!ext) {
    throw new Error('Skill package must be a .zip, .skill, or .md file')
  }
  return `${SKILL_KEY_PREFIX}${uuidv4()}.${ext}`
}

/**
 * A zip is valid when SKILL.md sits at the archive root or one folder down
 * (`skill-name/SKILL.md`). Deeper nests are a packing mistake.
 */
export function zipListsSkillMd(paths: string[]): boolean {
  return paths.some((raw) => {
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts[parts.length - 1] !== 'SKILL.md') return false
    return parts.length === 1 || parts.length === 2
  })
}
