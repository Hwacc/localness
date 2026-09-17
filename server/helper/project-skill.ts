import { createError } from 'h3'
import { SKILL_KEY_PREFIX } from '#shared/constants'

/**
 * Catalog rules for Project-scoped Skill packages. Handlers consult these so
 * "only the maintainer mutates" and "name is unique per project" cannot drift
 * between create / patch / delete.
 */

const NAME_MAX = 80
const DESCRIPTION_MAX = 500
const STORAGE_KEY = new RegExp(
  `^${SKILL_KEY_PREFIX}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(zip|md|skill)$`,
  'i'
)

export function parseSkillName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (name.length > NAME_MAX) {
    throw createError({ statusCode: 400, statusMessage: 'Name is too long' })
  }
  return name
}

export function parseSkillDescription(raw: unknown): string {
  const description = typeof raw === 'string' ? raw.trim() : ''
  if (!description) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Description is required',
    })
  }
  if (description.length > DESCRIPTION_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Description is too long',
    })
  }
  return description
}

export function parseSkillOriginalName(raw: unknown): string {
  const originalName = typeof raw === 'string' ? raw.trim() : ''
  if (!originalName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Original filename is required',
    })
  }
  return originalName
}

export function assertSkillStorageKey(raw: unknown): string {
  if (typeof raw !== 'string' || !STORAGE_KEY.test(raw)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid skill storage key',
    })
  }
  return raw
}

export function assertSkillMaintainer(
  row: { createdBy: number },
  userId: number
): void {
  if (Number(row.createdBy) !== Number(userId)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only the skill maintainer can change it',
    })
  }
}

export function assertSkillNameFree(taken: boolean): void {
  if (taken) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A skill with this name already exists in the project',
    })
  }
}

export function shapeProjectSkill(row: {
  id: number
  name: string
  description: string
  originalName: string
  createdBy: number
  createdAt: Date
  updatedAt: Date
  user: { username: string; nickname: string | null }
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    originalName: row.originalName,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    maintainerName: row.user.nickname || row.user.username,
    maintainerUsername: row.user.username,
  }
}
