import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import {
  assertSkillMaintainer,
  assertSkillNameFree,
  assertSkillStorageKey,
  parseSkillDescription,
  parseSkillName,
  parseSkillOriginalName,
  shapeProjectSkill,
} from '#server/helper/project-skill'

/**
 * @route PATCH /api/projects/:id/skills/:skillId
 * @description Maintainer-only. Replacing the package uploads a new blob first,
 * then sends the new storageKey; the previous object is deleted here.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  if (!id || !skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  const nSkillId = numericID(skillId)
  const access = await requireProjectAccess(event, projectId)

  const existing = await prisma.projectSkill.findFirst({
    where: { id: nSkillId, projectId },
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }
  assertSkillMaintainer(existing, access.userId)

  const body = await readBody(event)
  const data: {
    name?: string
    description?: string
    storageKey?: string
    originalName?: string
  } = {}

  if (body?.name != null) {
    const name = parseSkillName(body.name)
    const taken = await prisma.projectSkill.findFirst({
      where: { projectId, name, NOT: { id: nSkillId } },
      select: { id: true },
    })
    assertSkillNameFree(Boolean(taken))
    data.name = name
  }
  if (body?.description != null) {
    data.description = parseSkillDescription(body.description)
  }
  if (body?.storageKey != null) {
    data.storageKey = assertSkillStorageKey(body.storageKey)
    data.originalName = parseSkillOriginalName(body.originalName)
  }

  const updated = await prisma.projectSkill.update({
    where: { id: nSkillId },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      originalName: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { username: true, nickname: true } },
    },
  })

  if (data.storageKey && data.storageKey !== existing.storageKey) {
    try {
      await event.context.ossStorage.removeItem(existing.storageKey)
    } catch (error) {
      console.error(error)
    }
  }

  return shapeProjectSkill(updated)
})
