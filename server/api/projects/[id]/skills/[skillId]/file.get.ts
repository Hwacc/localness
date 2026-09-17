import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireProjectAccess } from '#server/helper/access'
import { OSSEngine } from '#shared/constants'

/**
 * @route GET /api/projects/:id/skills/:skillId/file
 * @description Any project member may download. Goes through this route rather
 * than GET /upload/:filename so the `skills/` prefix is not stripped.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const skillId = getRouterParam(event, 'skillId')
  if (!id || !skillId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const projectId = numericID(id)
  const nSkillId = numericID(skillId)
  await requireProjectAccess(event, projectId)

  const row = await prisma.projectSkill.findFirst({
    where: { id: nSkillId, projectId },
    select: { storageKey: true, originalName: true },
  })
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Skill not found' })
  }

  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(row.originalName)}`
  const engine =
    (process.env.NUXT_PUBLIC_OSS_ENGINE as OSSEngine) || OSSEngine.LOCAL
  const ossStorage = event.context.ossStorage

  switch (engine) {
    case OSSEngine.QINIU: {
      const url = await ossStorage.getItem(row.storageKey)
      if (!url || typeof url !== 'string') {
        throw createError({ statusCode: 404, statusMessage: 'File not found' })
      }
      return sendRedirect(event, url)
    }
    case OSSEngine.LOCAL: {
      const file = await ossStorage.getItemRaw(row.storageKey)
      if (!file) {
        throw createError({ statusCode: 404, statusMessage: 'File not found' })
      }
      setHeader(event, 'Content-Disposition', disposition)
      setHeader(event, 'Content-Type', 'application/octet-stream')
      return file
    }
    case OSSEngine.CLOUDFLARE:
      throw createError({
        statusCode: 501,
        statusMessage: 'CLOUDFLARE storage is not implemented',
      })
    default: {
      const exhaustive: never = engine
      throw createError({
        statusCode: 500,
        statusMessage: `Unsupported OSS engine: ${exhaustive}`,
      })
    }
  }
})
