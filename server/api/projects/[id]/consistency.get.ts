import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { scanProjectConsistency } from '#server/helper/consistency'
import {
  partitionIgnored,
  type ConsistencyFinding,
} from '#shared/utils/consistency'

/** Page names are context, not payload: cap keeps the card readable. */
const MAX_PAGES_PER_MEMBER = 8

/**
 * @route GET /api/projects/:id/consistency
 * @description The rule-registry report: duplicate source texts, source↔
 * translation token mismatches, lint and orphan findings — one scan, one
 * findings list. Read-only; it marks, never merges or blocks. Whitelisted
 * findings come back in `ignored` rather than disappearing, so the page can
 * offer a restore. Placeholder keys are included on purpose.
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

  const { sourceLocale, scannedKeys, findings: all, ignoreRows } =
    await scanProjectConsistency(nID)
  const { active, ignored: whitelisted } = partitionIgnored(all, ignoreRows)

  const findings = await enrich(active, nID)
  const ignored = await enrich(whitelisted, nID)
  return { sourceLocale, scannedKeys, findings, ignored }
})

type EnrichedFinding = Omit<ConsistencyFinding, 'keys'> & {
  keys: Array<
    ConsistencyFinding['keys'][number] & {
      pages: string[]
      pageCount: number
      sample: { pageId: number; tagId: number } | null
    }
  >
}

/**
 * Page names and a stable editor deep-link target, for every key any finding
 * surfaced — ordered by tag id so the first tag per key is deterministic.
 */
async function enrich(
  findings: ConsistencyFinding[],
  projectId: number
): Promise<EnrichedFinding[]> {
  const keyIds = [
    ...new Set(findings.flatMap((finding) => finding.keys.map((k) => k.keyId))),
  ]
  const pagesByKeyId = new Map<number, string[]>()
  const sampleByKeyId = new Map<number, { pageId: number; tagId: number }>()
  if (keyIds.length) {
    const tags = await prisma.tag.findMany({
      where: { i18nKeyId: { in: keyIds } },
      select: {
        id: true,
        pageID: true,
        i18nKeyId: true,
        page: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    })
    for (const tag of tags) {
      if (tag.i18nKeyId == null) continue
      const list = pagesByKeyId.get(tag.i18nKeyId)
      if (list) list.push(tag.page.name)
      else pagesByKeyId.set(tag.i18nKeyId, [tag.page.name])
      if (!sampleByKeyId.has(tag.i18nKeyId)) {
        sampleByKeyId.set(tag.i18nKeyId, { pageId: tag.pageID, tagId: tag.id })
      }
    }
  }

  return findings.map((finding) => ({
    ...finding,
    keys: finding.keys.map((member) => {
      const all = [...new Set(pagesByKeyId.get(member.keyId) ?? [])].sort()
      return {
        ...member,
        pages: all.slice(0, MAX_PAGES_PER_MEMBER),
        pageCount: all.length,
        sample: sampleByKeyId.get(member.keyId) ?? null,
      }
    }),
  }))
}
