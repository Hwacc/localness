import { omit } from 'lodash-es'
import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { requirePageTeamMember } from '#server/helper/access'
import { loadShapedTag, resolveTagI18n } from '#server/helper/i18n'

/**
 * @route POST /api/tag
 * @description Create a new tag
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const { settings, translationID, i18nKeyId, ...body } = await readZodBody(
    event,
    zTag.parse
  )
  if (!body.pageID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing pageID',
    })
  }
  await requirePageTeamMember(event, body.pageID as number)
  const i18n = await resolveTagI18n({
    pageID: body.pageID as number,
    i18nKey: body.i18nKey,
    translationID: translationID ?? i18nKeyId,
  })

  const createdTag = await prisma.tag.create({
    data: {
      ...omit(body, ['i18nKey']),
      i18nKey: i18n.i18nKey,
      i18nKeyId: i18n.i18nKeyId,
    },
  })

  await prisma.tagSettings.create({
    data: {
      tagID: createdTag.id,
      locked: settings?.locked ?? false,
      style: settings?.style ?? {},
      labelStyle: settings?.labelStyle ?? {},
      prompt: settings?.prompt ?? '',
    },
  })

  return await loadShapedTag(createdTag.id)
})
