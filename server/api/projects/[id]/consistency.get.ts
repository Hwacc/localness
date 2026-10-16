import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { sourceLocaleOf, sourceTextOf } from '#server/helper/i18n'
import { buildConsistencyGroups } from '#shared/utils/consistency'

/** Page names are context, not payload: cap keeps the card readable. */
const MAX_PAGES_PER_MEMBER = 8

/**
 * @route GET /api/projects/:id/consistency
 * @description Cross-key duplicate report: source texts shared (exactly or
 * after normalization) by different keys of the project. Read-only; it marks,
 * never merges or blocks. Draft placeholder keys are included on purpose —
 * a `__draft_` key next to a formal key with near-identical text is the most
 * actionable finding, resolved by binding in Capture.
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

  const sourceLocale = await sourceLocaleOf(nID)
  const rows = await prisma.i18nKey.findMany({
    where: { projectId: nID },
    select: {
      id: true,
      key: true,
      _count: { select: { tags: true } },
      locales: {
        where: { locale: sourceLocale },
        select: { locale: true, draftText: true },
      },
    },
  })

  const groups = buildConsistencyGroups(
    rows.map((row) => ({
      keyId: row.id,
      key: row.key,
      sourceText: sourceTextOf(row.locales, sourceLocale),
      tagCount: row._count.tags,
    }))
  )

  const memberKeyIds = groups.flatMap((group) =>
    group.members.map((member) => member.keyId)
  )
  if (!memberKeyIds.length) {
    return { sourceLocale, scannedKeys: rows.length, groups: [] }
  }

  // Second phase only for keys that made a group — page names are what make
  // "the same sentence on two different designs" visible at a glance. Ordered
  // by id so the first tag per key (the editor deep link target) is stable.
  const tags = await prisma.tag.findMany({
    where: { i18nKeyId: { in: memberKeyIds } },
    select: { id: true, pageID: true, i18nKeyId: true, page: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })
  const pagesByKeyId = new Map<number, string[]>()
  const sampleByKeyId = new Map<number, { pageId: number; tagId: number }>()
  for (const tag of tags) {
    if (tag.i18nKeyId == null) continue
    const list = pagesByKeyId.get(tag.i18nKeyId)
    if (list) list.push(tag.page.name)
    else pagesByKeyId.set(tag.i18nKeyId, [tag.page.name])
    if (!sampleByKeyId.has(tag.i18nKeyId)) {
      sampleByKeyId.set(tag.i18nKeyId, { pageId: tag.pageID, tagId: tag.id })
    }
  }

  return {
    sourceLocale,
    scannedKeys: rows.length,
    groups: groups.map((group) => ({
      ...group,
      members: group.members.map((member) => {
        const all = [...new Set(pagesByKeyId.get(member.keyId) ?? [])].sort()
        return {
          ...member,
          pages: all.slice(0, MAX_PAGES_PER_MEMBER),
          pageCount: all.length,
          sample: sampleByKeyId.get(member.keyId) ?? null,
        }
      }),
    })),
  }
})
