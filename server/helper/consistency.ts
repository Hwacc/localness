import prisma from '#server/libs/prisma'
import { sourceLocaleOf } from '#server/helper/i18n'
import {
  detectAll,
  scanSourceText,
  withPluralFamilies,
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
  const [rows, lintRules, ignoreRows] = await Promise.all([
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
    loadLintRules(projectId),
    prisma.consistencyIgnore.findMany({
      where: { projectId },
      select: { ruleId: true, groupId: true, keyIds: true },
    }),
  ])

  const keys: ScanKeyInput[] = withPluralFamilies(
    rows.map((row) => ({
      keyId: row.id,
      key: row.key,
      tagCount: row._count.tags,
      ...scanSourceText(row.locales, sourceLocale),
      locales: row.locales,
    })),
    sourceLocale
  )

  return {
    sourceLocale,
    scannedKeys: rows.length,
    findings: detectAll({
      projectId,
      sourceLocale,
      lintRules,
      keys,
    }),
    ignoreRows: ignoreRows.map((row) => ({
      ruleId: row.ruleId,
      groupId: row.groupId,
      keyIds: normalizeKeyIds(row.keyIds),
    })),
  }
}

/** Project lint switches by ruleId; absent entry = enabled. */
export async function loadLintRules(
  projectId: number
): Promise<Record<string, boolean>> {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: { lintRules: true },
  })
  return normalizeLintRules(settings?.lintRules)
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
