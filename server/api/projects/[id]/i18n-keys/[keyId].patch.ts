import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'

/**
 * @route PATCH /api/projects/:id/i18n-keys/:keyId
 * @description Rename key or update description
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
  const body = await readZodBody(event, zI18nKeyPatch.parse)

  const existing = await prisma.i18nKey.findFirst({
    where: { id: nKeyId, projectId: nID },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Key not found',
    })
  }

  const nextKey = body.key?.trim()
  if (nextKey && nextKey !== existing.key) {
    const clash = await prisma.i18nKey.findUnique({
      where: {
        projectId_key: { projectId: nID, key: nextKey },
      },
    })
    if (clash) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Key already exists',
      })
    }
  }

  const updated = await prisma.i18nKey.update({
    where: { id: nKeyId },
    data: {
      ...(nextKey ? { key: nextKey } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    },
    include: {
      locales: true,
      _count: { select: { tags: true } },
    },
  })

  if (nextKey && nextKey !== existing.key) {
    await prisma.tag.updateMany({
      where: { i18nKeyId: nKeyId },
      data: { i18nKey: nextKey },
    })
  }

  const locales = updated.locales.map((locale) => ({
    locale: locale.locale,
    draftText: locale.draftText,
    publishedText: locale.publishedText,
  }))
  return {
    id: updated.id,
    key: updated.key,
    origin: updated.origin,
    description: updated.description,
    updatedAt: updated.updatedAt,
    tagCount: updated._count.tags,
    dirty: locales.some(
      (locale) => (locale.draftText ?? '') !== (locale.publishedText ?? '')
    ),
    locales,
  }
})
