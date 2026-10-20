import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { sourceLocaleOf } from '#server/helper/i18n'
import { loadScanSettings } from '#server/helper/consistency'
import {
  dialectSyntax,
  pluralBase,
  pluralSiblingNames,
  scanSourceText,
  withPluralFamilies,
} from '#shared/utils/consistency'
import { zConsistencyKeysQuery } from '#shared/utils/schemas'

/**
 * @route GET /api/projects/:id/consistency/keys?keyIds=1,2
 * @description The members of one finding with every locale's draft and
 * published text — what the Resolve drawer plans a merge or a fix from.
 * Exact ids, never a text search, so no member can be missed.
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  requirePlus()

  const { keyIds } = await getValidatedQuery(event, zConsistencyKeysQuery.parse)
  const sourceLocale = await sourceLocaleOf(nID)
  const [rows, settings] = await Promise.all([
    prisma.i18nKey.findMany({
      where: { projectId: nID, id: { in: keyIds } },
      select: {
        id: true,
        key: true,
        fingerprint: true,
        createdAt: true,
        _count: { select: { tags: true } },
        locales: {
          select: {
            locale: true,
            draftText: true,
            publishedText: true,
            sourceFingerprint: true,
          },
          orderBy: { locale: 'asc' },
        },
      },
    }),
    loadScanSettings(nID),
  ])
  const byId = new Map(rows.map((row) => [row.id, row]))

  // The live recheck must see the plural family the scan saw.
  const siblingNames = dialectSyntax(settings.dialect).pluralKeys
    ? [
        ...new Set(
          rows.flatMap((row) => {
            const base = pluralBase(row.key)
            return base === null ? [] : pluralSiblingNames(base)
          })
        ),
      ]
    : []
  const siblings = siblingNames.length
    ? await prisma.i18nKey.findMany({
        where: { projectId: nID, key: { in: siblingNames } },
        select: {
          key: true,
          _count: { select: { tags: true } },
          locales: {
            where: { locale: sourceLocale },
            select: { locale: true, draftText: true, publishedText: true },
          },
        },
      })
    : []

  const keys = keyIds.flatMap((keyId) => {
    const row = byId.get(keyId)
    if (!row) return []
    return [
      {
        keyId: row.id,
        key: row.key,
        fingerprint: row.fingerprint,
        createdAt: row.createdAt.toISOString(),
        tagCount: row._count.tags,
        ...scanSourceText(row.locales, sourceLocale),
        locales: row.locales,
      },
    ]
  })

  return {
    sourceLocale,
    settings,
    keys: withPluralFamilies(keys, sourceLocale, {
      dialect: settings.dialect,
      entries: [
        ...keys,
        ...siblings.map((sibling) => ({
          key: sibling.key,
          tagCount: sibling._count.tags,
          locales: sibling.locales,
        })),
      ],
    }),
  }
})
