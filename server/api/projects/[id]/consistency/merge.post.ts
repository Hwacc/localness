import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { readZodBody } from '#server/helper/validate'
import {
  localesToContent,
  purgeI18nKey,
  sourceLocaleOf,
} from '#server/helper/i18n'
import { LogAction, LogStatus } from '#shared/constants/log'
import {
  isPublishedKey,
  resolveMergeWrites,
  type MergeCandidate,
} from '#shared/utils/consistency'
import { zConsistencyMerge } from '#shared/schemas'

/**
 * @route POST /api/projects/:id/consistency/merge
 * @description Fold duplicate keys into one keeper in a single transaction:
 * their tags move to the keeper (with a TagLog row each), their release
 * labels join the keeper's, the picked translations land on the keeper, and
 * the emptied keys are deleted. The text plan is `resolveMergeWrites` — the
 * same function the drawer previews with. A merged key must never have been
 * published: code or the delivery API may read its name, so the user reverts
 * it to draft first, on purpose.
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  const { userId } = await requireTeamMember(event, nID)
  requirePlus()

  const body = await readZodBody(event, zConsistencyMerge.parse)
  const mergeKeyIds = [...new Set(body.mergeKeyIds)].filter(
    (keyId) => keyId !== body.keeperId
  )
  if (!mergeKeyIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing to merge' })
  }

  const rows = await prisma.i18nKey.findMany({
    where: { projectId: nID, id: { in: [body.keeperId, ...mergeKeyIds] } },
    include: {
      locales: true,
      releases: { select: { releaseId: true } },
      _count: { select: { tags: true } },
    },
  })
  const keeperRow = rows.find((row) => row.id === body.keeperId)
  const mergedRows = rows.filter((row) => row.id !== body.keeperId)
  if (!keeperRow || mergedRows.length !== mergeKeyIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'Translation not found' })
  }

  const toCandidate = (row: (typeof rows)[number]): MergeCandidate => ({
    keyId: row.id,
    key: row.key,
    tagCount: row._count.tags,
    createdAt: row.createdAt.toISOString(),
    locales: row.locales,
  })
  const keeper = toCandidate(keeperRow)
  const merged = mergedRows.map(toCandidate)

  const published = merged.filter((candidate) => isPublishedKey(candidate))
  if (published.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `Revert to draft before merging: ${published.map((c) => c.key).join(', ')}`,
    })
  }

  const sourceLocale = await sourceLocaleOf(nID)
  let writes: Record<string, string>
  try {
    writes = resolveMergeWrites(keeper, merged, sourceLocale, body.picks)
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Invalid picks',
    })
  }
  // A live keeper stays live: what it takes on is published with it, the same
  // way the drawer's Save & publish works.
  const keeperLive = isPublishedKey(keeper)

  const result = await prisma.$transaction(async (tx) => {
    const tags = await tx.tag.findMany({
      where: { i18nKeyId: { in: mergeKeyIds } },
      select: { id: true, i18nKeyId: true, i18nKey: true },
    })
    if (tags.length) {
      await tx.tag.updateMany({
        where: { id: { in: tags.map((tag) => tag.id) } },
        data: { i18nKeyId: keeperRow.id, i18nKey: keeperRow.key },
      })
      await tx.tagLog.createMany({
        data: tags.map((tag) => ({
          action: LogAction.UPDATE,
          status: LogStatus.SUCCESS,
          tagID: tag.id,
          userID: userId,
          beforeData: { i18nKeyId: tag.i18nKeyId, i18nKey: tag.i18nKey },
          afterData: { i18nKeyId: keeperRow.id, i18nKey: keeperRow.key },
        })),
      })
    }

    const owned = new Set(keeperRow.releases.map((r) => r.releaseId))
    const addReleases = [
      ...new Set(mergedRows.flatMap((row) => row.releases.map((r) => r.releaseId))),
    ].filter((releaseId) => !owned.has(releaseId))
    if (addReleases.length) {
      await tx.i18nKeyRelease.createMany({
        data: addReleases.map((releaseId) => ({
          i18nKeyId: keeperRow.id,
          releaseId,
        })),
      })
    }

    for (const [locale, text] of Object.entries(writes)) {
      await tx.localeValue.upsert({
        where: { i18nKeyId_locale: { i18nKeyId: keeperRow.id, locale } },
        create: {
          i18nKeyId: keeperRow.id,
          locale,
          draftText: text,
          publishedText: keeperLive ? text : null,
          sourceFingerprint: keeperRow.fingerprint,
        },
        update: {
          draftText: text,
          ...(keeperLive ? { publishedText: text } : {}),
          sourceFingerprint: keeperRow.fingerprint,
        },
      })
    }

    for (const row of mergedRows) await purgeI18nKey(tx, row)

    const after = await tx.localeValue.findMany({
      where: { i18nKeyId: keeperRow.id },
    })
    await tx.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        userID: userId,
        i18nKeyId: keeperRow.id,
        fingerprint: keeperRow.fingerprint,
        beforeData: localesToContent(keeperRow.locales),
        afterData: {
          ...localesToContent(after),
          mergedKeys: mergedRows.map((row) => row.key),
        },
      },
    })
    await tx.translationLog.createMany({
      data: mergedRows.map((row) => ({
        action: LogAction.DELETE,
        status: LogStatus.SUCCESS,
        userID: userId,
        fingerprint: row.fingerprint,
        beforeData: { ...row, mergedInto: keeperRow.key },
      })),
    })
    return { movedTags: tags.length }
  })

  return {
    keeperId: keeperRow.id,
    deletedKeyIds: mergeKeyIds,
    movedTags: result.movedTags,
    writtenLocales: Object.keys(writes),
  }
})
