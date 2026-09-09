import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'

/**
 * @route GET /api/projects/:id/i18n-keys/:keyId/refs
 * @description Tags for an i18n key, grouped by page
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const keyId = getRouterParam(event, 'keyId')
  if (!id || !keyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const nKeyId = numericID(keyId)
  await requireTeamMember(event, nID)

  const record = await prisma.i18nKey.findFirst({
    where: { id: nKeyId, projectId: nID },
    select: { id: true, key: true },
  })
  if (!record) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Key not found',
    })
  }

  const tags = await prisma.tag.findMany({
    where: { i18nKeyId: nKeyId, page: { projectID: nID } },
    include: {
      page: {
        select: { id: true, name: true, image: true },
      },
      settings: {
        select: { style: true, labelStyle: true, locked: true },
      },
    },
    orderBy: { id: 'asc' },
  })

  const byPage = new Map<
    number,
    {
      id: number
      name: string
      image: string | null
      tags: {
        id: number
        x: number
        y: number
        width: number
        height: number
        settings: unknown
      }[]
    }
  >()

  for (const tag of tags) {
    const page = tag.page
    if (!page) continue
    let group = byPage.get(page.id)
    if (!group) {
      group = {
        id: page.id,
        name: page.name,
        image: page.image,
        tags: [],
      }
      byPage.set(page.id, group)
    }
    group.tags.push({
      id: tag.id,
      x: tag.x,
      y: tag.y,
      width: tag.width,
      height: tag.height,
      settings: tag.settings,
    })
  }

  return {
    key: record.key,
    pages: [...byPage.values()],
  }
})
