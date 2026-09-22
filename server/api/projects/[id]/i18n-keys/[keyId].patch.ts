import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  assertI18nKeyWritable,
  shapeI18nKeyRow,
  sourceLocaleOf,
  sourceTextOf,
} from '#server/helper/i18n'
import { keyClashMessage } from '#server/helper/key-convention'

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
  const sourceLocale = await sourceLocaleOf(nID)

  const existing = await prisma.i18nKey.findFirst({
    where: { id: nKeyId, projectId: nID },
    include: { locales: true },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Key not found',
    })
  }
  assertI18nKeyWritable(existing.locales)

  const nextKey = body.key?.trim()
  if (nextKey && nextKey !== existing.key) {
    const clash = await prisma.i18nKey.findUnique({
      where: {
        projectId_key: { projectId: nID, key: nextKey },
      },
      select: {
        key: true,
        locales: {
          where: { locale: sourceLocale },
          select: { locale: true, draftText: true },
        },
      },
    })
    if (clash) {
      // Still refused: taking the name would mean merging two entries, which is
      // a different operation. The message at least says which case this is —
      // the second text is the one the row being renamed carries.
      throw createError({
        statusCode: 409,
        statusMessage: keyClashMessage(
          { key: clash.key, origin: sourceTextOf(clash.locales, sourceLocale) },
          sourceTextOf(existing.locales, sourceLocale)
        ),
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

  return shapeI18nKeyRow(updated, sourceLocale)
})
