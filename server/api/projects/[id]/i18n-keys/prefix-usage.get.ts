import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { projectKeyPrefix } from '#server/helper/namespace'
import { stripProjectPrefix } from '#shared/utils/namespace'

/**
 * @route GET /api/projects/:id/i18n-keys/prefix-usage
 * @description How many keys carry the project's saved key prefix, so Project
 * Settings can warn before the prefix changes. Re-checked in JS because SQL
 * `LIKE` treats `_` as a wildcard and ignores case on SQLite.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)

  const prefix = await projectKeyPrefix(projectId)
  if (!prefix) return { prefix, count: 0 }
  const keys = await prisma.i18nKey.findMany({
    where: { projectId, key: { startsWith: prefix } },
    select: { key: true },
  })
  const count = keys.filter(
    (row) => stripProjectPrefix(row.key, prefix) !== row.key
  ).length
  return { prefix, count }
})
