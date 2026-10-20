import prisma from '#server/libs/prisma'
import { sourceLocaleOf } from '#server/helper/i18n'
import {
  detectAll,
  parseI18nDialect,
  RULE_SEVERITY_VALUES,
  scanSourceText,
  withPluralFamilies,
  type ConsistencyFinding,
  type IgnoreRow,
  type RuleSeverity,
  type ScanKeyInput,
  type ScanSettings,
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
    loadScanSettings(projectId),
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
    sourceLocale,
    { dialect: settings.dialect }
  )

  return {
    sourceLocale,
    scannedKeys: rows.length,
    findings: detectAll({
      ...settings,
      projectId,
      sourceLocale,
      keys,
    }),
    ignoreRows: ignoreRows.map((row) => ({
      ruleId: row.ruleId,
      groupId: row.groupId,
      keyIds: normalizeKeyIds(row.keyIds),
    })),
  }
}

/** The project's Consistency settings, normalized; missing row = defaults. */
export async function loadScanSettings(projectId: number): Promise<ScanSettings> {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: { lintRules: true, i18nDialect: true, ruleSeverity: true },
  })
  return {
    lintRules: normalizeLintRules(settings?.lintRules),
    dialect: parseI18nDialect(settings?.i18nDialect),
    ruleSeverity: normalizeRuleSeverity(settings?.ruleSeverity),
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

function normalizeRuleSeverity(value: unknown): Record<string, RuleSeverity> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  const out: Record<string, RuleSeverity> = {}
  for (const [ruleId, severity] of Object.entries(value)) {
    const known = RULE_SEVERITY_VALUES.find((candidate) => candidate === severity)
    if (known) out[ruleId] = known
  }
  return out
}

function normalizeKeyIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number')
}
