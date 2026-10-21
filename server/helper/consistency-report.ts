import prisma from '#server/libs/prisma'
import type { Prisma } from '~~/prisma/client/client'
import { parseSnapshotRow } from '#server/helper/consistency'
import {
  CATEGORY_ORDER,
  fromLikeSafe,
  likeSafe,
  localePattern,
  REPORT_PAGE_MAX,
  REPORT_PAGE_SIZE,
  reportQueryNeedle,
  SEVERITY_ORDER,
  type ConsistencyFinding,
  type FindingCategory,
  type FindingSeverity,
  type ReportFilter,
  type ReportFinding,
} from '#shared/utils/consistency'

/** Page names are context, not payload: cap keeps the card readable. */
const MAX_PAGES_PER_MEMBER = 8

type FindingWhere = Prisma.ConsistencySnapshotFindingWhereInput

const PAGE_ORDER: Prisma.ConsistencySnapshotFindingOrderByWithRelationInput[] = [
  { severityRank: 'asc' },
  { ruleOrder: 'asc' },
  { sortKey: 'asc' },
  { id: 'asc' },
]

const ROW_SELECT = {
  ruleId: true,
  groupId: true,
  severity: true,
  category: true,
  keys: true,
  meta: true,
} as const

/** The SQL side of `matchesFindingIndex` (shared) — keep the two in step. */
function activeWhere(projectId: number, filter?: ReportFilter): FindingWhere {
  const where: FindingWhere = { projectId, ignored: false }
  if (!filter) return where
  const and: FindingWhere[] = []
  if (filter.severities.length) and.push({ severity: { in: filter.severities } })
  if (filter.ruleIds.length) and.push({ ruleId: { in: filter.ruleIds } })
  if (filter.locales.length) {
    and.push({
      OR: filter.locales.map((locale) => ({
        locales: { contains: localePattern(locale) },
      })),
    })
  }
  const needle = reportQueryNeedle(filter.query)
  if (needle) and.push({ searchText: { contains: likeSafe(needle) } })
  return and.length ? { ...where, AND: and } : where
}

async function readPage(
  where: FindingWhere,
  offset: number,
  limit: number
): Promise<ConsistencyFinding[]> {
  const rows = await prisma.consistencySnapshotFinding.findMany({
    where,
    orderBy: PAGE_ORDER,
    skip: offset,
    take: limit,
    select: ROW_SELECT,
  })
  return rows.flatMap((row) => parseSnapshotRow(row) ?? [])
}

export type ReportCategoryPage = {
  category: FindingCategory
  /** Findings of this category under the filter, not just this page. */
  total: number
  worst: FindingSeverity
  findings: ReportFinding[]
}

/**
 * The report head: unfiltered severity counts, filter facets, and for each
 * category with a match its filtered total plus the first page (`limits` asks
 * for more, so a reload keeps what was shown). Null before the first scan.
 */
export async function readReportSummary(
  projectId: number,
  filter: ReportFilter,
  limits: Partial<Record<FindingCategory, number>>
) {
  const [snapshot, bySeverity, ignoredCount, localeRows, ruleRows, byCategory] =
    await Promise.all([
      prisma.consistencySnapshot.findUnique({ where: { projectId } }),
      prisma.consistencySnapshotFinding.groupBy({
        by: ['severity'],
        where: activeWhere(projectId),
        _count: { _all: true },
      }),
      prisma.consistencySnapshotFinding.count({
        where: { projectId, ignored: true },
      }),
      prisma.consistencySnapshotFinding.findMany({
        where: { ...activeWhere(projectId), locales: { not: '' } },
        distinct: ['locales'],
        select: { locales: true },
      }),
      prisma.consistencySnapshotFinding.groupBy({
        by: ['ruleId'],
        where: activeWhere(projectId),
      }),
      prisma.consistencySnapshotFinding.groupBy({
        by: ['category', 'severity'],
        where: activeWhere(projectId, filter),
        _count: { _all: true },
      }),
    ])
  if (!snapshot) return null

  const counts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const row of bySeverity) {
    const severity = SEVERITY_ORDER.find((value) => value === row.severity)
    if (severity) counts[severity] += row._count._all
  }

  const categories = await Promise.all(
    CATEGORY_ORDER.flatMap((category) => {
      const rows = byCategory.filter((row) => row.category === category)
      const total = rows.reduce((sum, row) => sum + row._count._all, 0)
      const worst = SEVERITY_ORDER.find((severity) =>
        rows.some((row) => row.severity === severity)
      )
      if (!total || !worst) return []
      const limit = Math.min(
        Math.max(limits[category] ?? REPORT_PAGE_SIZE, REPORT_PAGE_SIZE),
        REPORT_PAGE_MAX
      )
      return [
        readPage({ ...activeWhere(projectId, filter), category }, 0, limit).then(
          (findings) => ({ category, total, worst, findings })
        ),
      ]
    })
  )
  const enriched = await enrichFindings(
    categories.flatMap((group) => group.findings)
  )
  let at = 0
  const pages: ReportCategoryPage[] = categories.map((group) => {
    const findings = enriched.slice(at, at + group.findings.length)
    at += group.findings.length
    return { ...group, findings }
  })

  return {
    version: snapshot.version,
    sourceLocale: snapshot.sourceLocale,
    scannedKeys: snapshot.scannedKeys,
    scannedAt: snapshot.scannedAt.toISOString(),
    durationMs: snapshot.durationMs,
    total: counts.error + counts.warning + counts.info,
    counts,
    ignoredCount,
    facets: {
      locales: [
        ...new Set(
          localeRows.flatMap((row) =>
            fromLikeSafe(row.locales).split(',').filter(Boolean)
          )
        ),
      ].sort(),
      ruleIds: ruleRows.map((row) => row.ruleId),
    },
    categories: pages,
  }
}

/** One more page of one category under the filter. */
export async function readReportFindings(
  projectId: number,
  category: FindingCategory,
  filter: ReportFilter,
  offset: number,
  limit: number
): Promise<{ findings: ReportFinding[]; total: number }> {
  const where = { ...activeWhere(projectId, filter), category }
  const [findings, total] = await Promise.all([
    readPage(where, offset, limit),
    prisma.consistencySnapshotFinding.count({ where }),
  ])
  return { findings: await enrichFindings(findings), total }
}

/** One page of the whitelisted findings, in report order. */
export async function readIgnoredFindings(
  projectId: number,
  offset: number,
  limit: number
): Promise<{ findings: ReportFinding[]; total: number }> {
  const where: FindingWhere = { projectId, ignored: true }
  const [findings, total] = await Promise.all([
    readPage(where, offset, limit),
    prisma.consistencySnapshotFinding.count({ where }),
  ])
  return { findings: await enrichFindings(findings), total }
}

/**
 * Page names and a stable editor deep-link target for every key the page
 * surfaced — ordered by tag id so the first tag per key is deterministic.
 */
async function enrichFindings(
  findings: ConsistencyFinding[]
): Promise<ReportFinding[]> {
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
