import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { numericID } from '#server/helper/id'
import { requireTagTeamMember } from '#server/helper/access'
import {
  deleteUnusedDraftI18nKey,
  loadShapedTag,
  resolveTagI18n,
} from '#server/helper/i18n'

/**
 * @route POST /api/tag/:id
 * @description Update a tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  await requireTagTeamMember(event, nID)
  const { settings, translationID, i18nKeyId, ...body } = await readZodBody(
    event,
    zTag.partial().parse
  )

  if (settings) {
    await prisma.tagSettings.upsert({
      where: {
        tagID: nID,
      },
      create: {
        tagID: nID,
        ...settings,
      },
      update: settings,
    })
  }

  const existing = await prisma.tag.findUnique({
    where: { id: nID },
    select: { pageID: true, i18nKey: true, i18nKeyId: true },
  })
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tag not found',
    })
  }

  const explicitId =
    translationID !== undefined
      ? translationID
      : i18nKeyId !== undefined
        ? i18nKeyId
        : undefined
  const shouldBind =
    body.i18nKey !== undefined || explicitId !== undefined
  const i18n = shouldBind
    ? await resolveTagI18n({
        pageID: existing.pageID,
        i18nKey:
          body.i18nKey !== undefined
            ? body.i18nKey
            : explicitId != null
              ? undefined
              : existing.i18nKey,
        translationID:
          explicitId !== undefined ? explicitId : existing.i18nKeyId,
      })
    : null

  await prisma.tag.update({
    where: {
      id: nID,
    },
    data: {
      ...omit(body, ['i18nKey', 'pageID']),
      ...(i18n
        ? { i18nKey: i18n.i18nKey, i18nKeyId: i18n.i18nKeyId }
        : {}),
    },
  })

  if (
    existing.i18nKeyId &&
    i18n?.i18nKeyId &&
    existing.i18nKeyId !== i18n.i18nKeyId
  ) {
    await deleteUnusedDraftI18nKey(existing.i18nKeyId)
  }

  return await loadShapedTag(nID)
})
