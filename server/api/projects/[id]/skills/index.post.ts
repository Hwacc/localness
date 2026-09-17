import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import {
  assertSkillNameFree,
  assertSkillStorageKey,
  parseSkillDescription,
  parseSkillName,
  parseSkillOriginalName,
  shapeProjectSkill,
} from '#server/helper/project-skill'

/**
 * @route POST /api/projects/:id/skills
 * @description Register a package already stored in OSS. The blob is uploaded
 * by the client first; this only writes the catalog row.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project id' })
  }
  const projectId = numericID(id)
  const access = await requireProjectAccess(event, projectId)

  const body = await readBody(event)
  const name = parseSkillName(body?.name)
  const description = parseSkillDescription(body?.description)
  const storageKey = assertSkillStorageKey(body?.storageKey)
  const originalName = parseSkillOriginalName(body?.originalName)

  const taken = await prisma.projectSkill.findFirst({
    where: { projectId, name },
    select: { id: true },
  })
  assertSkillNameFree(Boolean(taken))

  const created = await prisma.projectSkill.create({
    data: {
      projectId,
      createdBy: access.userId,
      name,
      description,
      storageKey,
      originalName,
    },
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

  return shapeProjectSkill(created)
})
