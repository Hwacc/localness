import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import { assertSkillMaintainer } from '#server/helper/project-skill'

/**
 * @route DELETE /api/projects/:id/skills/:skillId
 * @description Maintainer-only. The OSS object is best-effort deleted; a
 * leftover blob must not block removing the catalog row.
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

  try {
    await event.context.ossStorage.removeItem(existing.storageKey)
  } catch (error) {
    console.error(error)
  }

  await prisma.projectSkill.delete({ where: { id: nSkillId } })
  return { ok: true }
})
