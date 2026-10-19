import prisma from '#server/libs/prisma'
import { sourceLocaleOf, sourceTextOf } from '#server/helper/i18n'
import {
  detectAll,
  type ConsistencyFinding,
  type IgnoreRow,
  type ScanKeyInput,
} from '#shared/utils/consistency'

export interface ConsistencyScan {
  sourceLocale: string
  scannedKeys: number
  findings: ConsistencyFinding[]
  ignoreRows: IgnoreRow[]
}

/**
 * One full rule-registry pass over a project. Shared by the report and the
 * ignore endpoint: the whitelist snapshot must be what the server found, never
 * a client-supplied key list (a forged superset would bury future duplicates).
 */
export async function scanProjectConsistency(
  projectId: number
): Promise<ConsistencyScan> {
  const sourceLocale = await sourceLocaleOf(projectId)
  const [rows, settings, ignoreRows] = await Promise.all([
    prisma.i18nKey.findMany({
      where: { projectId },
      select: {
        id: true,
        key: true,
        _count: { select: { tags: true } },
        locales: {
          select: { locale: true, draftText: true, publishedText: true },
        },
      },
    }),
    prisma.projectSettings.findUnique({
      where: { projectID: projectId },
      select: { lintRules: true },
    }),
    prisma.consistencyIgnore.findMany({
      where: { projectId },
      select: { ruleId: true, groupId: true, keyIds: true },
    }),
  ])

  const keys: ScanKeyInput[] = rows.map((row) => ({
    keyId: row.id,
    key: row.key,
    tagCount: row._count.tags,
    sourceText: sourceTextOf(row.locales, sourceLocale),
    locales: row.locales,
  }))

  return {
    sourceLocale,
    scannedKeys: rows.length,
    findings: detectAll({
      projectId,
      sourceLocale,
      lintRules: normalizeLintRules(settings?.lintRules),
      keys,
    }),
    ignoreRows: ignoreRows.map((row) => ({
      ruleId: row.ruleId,
      groupId: row.groupId,
      keyIds: normalizeKeyIds(row.keyIds),
    })),
  }
}

function normalizeLintRules(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, boolean> = {}
  for (const [ruleId, enabled] of Object.entries(value)) {
    if (typeof enabled === 'boolean') out[ruleId] = enabled
  }
  return out
}

function normalizeKeyIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number')
}
