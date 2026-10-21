import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import prisma from '#server/libs/prisma'
import { consistencyContentStamp } from '#server/libs/consistency-stamp'
import { sourceLocaleOf } from '#server/helper/i18n'
import { createScanJobs, type ScanProgress } from '#server/helper/scan-jobs'
import {
  formatMs,
  scanLogger,
  type ScanLogger,
} from '#server/helper/consistency-log'
import type { ScanWorkerMessage } from '#server/workers/consistency'
import {
  allRules,
  CATEGORY_ORDER,
  detectAll,
  findingIndex,
  findingKey,
  dialectSyntax,
  keyRules,
  parseI18nDialect,
  partitionIgnored,
  pluralBase,
  pluralSiblingNames,
  RULE_SEVERITY_VALUES,
  SEVERITY_ORDER,
  scanSourceText,
  withPluralFamilies,
  type ConsistencyFinding,
  type ConsistencyMember,
  type RuleProgress,
  type IgnoreRow,
  type RuleSeverity,
  type ScanContext,
  type ScanKeyInput,
  type ScanSettings,
} from '#shared/utils/consistency'

/**
 * Started from source through tsx — see the file. Resolved against the
 * working directory: `pnpm dev` runs from the repo root, the image from /app.
 */
const WORKER_ENTRY = resolve(process.cwd(), 'server/workers/consistency.ts')

/** Bump when the snapshot row format changes so old snapshots read outdated. */
const SNAPSHOT_FORMAT = 2

const SAVE_BATCH = 500

/** The report's background scans; one per project at a time. */
export const consistencyScans = createScanJobs(runScan)

/**
 * The stamp a snapshot is valid for: row stamps plus everything else that
 * changes findings — settings, source language and the rule code itself
 * (app version + commit). Ignore rows are not part of it: each row's
 * `ignored` is set when it is written and flipped by the ignore toggle.
 */
export async function currentScanVersion(projectId: number): Promise<string> {
  const [stamp, settings, sourceLocale] = await Promise.all([
    consistencyContentStamp(projectId),
    loadScanSettings(projectId),
    sourceLocaleOf(projectId),
  ])
  const { appVersion, appCommit } = useRuntimeConfig().public
  return createHash('sha1')
    .update(
      JSON.stringify([
        SNAPSHOT_FORMAT,
        appVersion,
        appCommit,
        sourceLocale,
        settings,
        stamp,
      ])
    )
    .digest('hex')
}

/** One snapshot row back as a finding; null for a row this build cannot read. */
export function parseSnapshotRow(row: {
  ruleId: string
  groupId: string
  severity: string
  category: string
  keys: string
  meta: string | null
}): ConsistencyFinding | null {
  const severity = SEVERITY_ORDER.find((value) => value === row.severity)
  const category = CATEGORY_ORDER.find((value) => value === row.category)
  if (!severity || !category) return null
  return {
    ruleId: row.ruleId,
    severity,
    category,
    groupId: row.groupId,
    keys: JSON.parse(row.keys),
    ...(row.meta ? { meta: JSON.parse(row.meta) } : {}),
  }
}

/**
 * The member key ids of one snapshot finding, or null when the latest scan
 * did not find it. The ignore endpoint records these — server data, never a
 * client-supplied list (a forged superset would bury future duplicates).
 */
export async function snapshotFindingKeyIds(
  projectId: number,
  ruleId: string,
  groupId: string
): Promise<number[] | null> {
  const row = await prisma.consistencySnapshotFinding.findFirst({
    where: { projectId, ruleId, groupId },
    select: { keys: true },
  })
  if (!row) return null
  const members: ConsistencyMember[] = JSON.parse(row.keys)
  return members.map((member) => member.keyId)
}

export async function loadIgnoreRows(
  projectId: number,
  client: Pick<typeof prisma, 'consistencyIgnore'> = prisma
): Promise<IgnoreRow[]> {
  const rows = await client.consistencyIgnore.findMany({
    where: { projectId },
    select: { ruleId: true, groupId: true, keyIds: true },
  })
  return rows.map((row) => ({
    ruleId: row.ruleId,
    groupId: row.groupId,
    keyIds: normalizeKeyIds(row.keyIds),
  }))
}

/**
 * One full rule-registry pass, saved as the project's snapshot. The version
 * is taken before the rows are read, so an edit landing mid-scan leaves the
 * snapshot outdated rather than wrongly fresh.
 */
async function runScan(
  projectId: number,
  progress: (update: ScanProgress) => void
): Promise<void> {
  const log = scanLogger(projectId)
  const startedAt = Date.now()
  const version = await currentScanVersion(projectId)
  const ctx = await loadScanContext(projectId)
  log.info(`scan started: ${ctx.keys.length} keys loaded in ${formatMs(Date.now() - startedAt)}`)
  progress({ phase: 'checking', done: 0, total: allRules.length })
  const findings = await detectOffThread(ctx, log, ({ done, total }) =>
    progress({ phase: 'checking', done, total })
  )
  progress({ phase: 'saving' })
  const savingAt = Date.now()
  await saveSnapshot(ctx, version, findings, Date.now() - startedAt)
  log.info(
    `snapshot saved in ${formatMs(Date.now() - savingAt)}: ${findings.length} findings, scan took ${formatMs(Date.now() - startedAt)}`
  )
}

function logRule(log: ScanLogger, rule: RuleProgress) {
  log.debug(
    `  rule ${rule.done}/${rule.total} ${rule.ruleId}: ${
      rule.off ? 'off' : `${rule.findings} findings in ${formatMs(rule.ms)}`
    }`
  )
}

/** The main-thread rule pass — the worker's fallback; logs like the worker. */
function detectInline(
  ctx: ScanContext,
  log: ScanLogger,
  onRule: (progress: RuleProgress) => void
): ConsistencyFinding[] {
  const startedAt = performance.now()
  const findings = detectAll(ctx, {
    onRule: (rule) => {
      logRule(log, rule)
      onRule(rule)
    },
  })
  log.info(
    `main thread checked ${allRules.length} rules in ${formatMs(performance.now() - startedAt)}: ${findings.length} findings`
  )
  return findings
}

/** Every key of the project, or only `keyIds` for a single-key recheck. */
async function loadScanContext(
  projectId: number,
  keyIds?: number[]
): Promise<ScanContext> {
  const sourceLocale = await sourceLocaleOf(projectId)
  const [rows, settings] = await Promise.all([
    prisma.i18nKey.findMany({
      where: keyIds ? { projectId, id: { in: keyIds } } : { projectId },
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
  return { ...settings, projectId, sourceLocale, keys }
}

/**
 * Runs the rules in a worker thread so a large project does not stall every
 * other request. If the worker cannot boot (entry missing, tsx unavailable)
 * the scan falls back to the main thread — slower for others, still correct.
 * A rule that throws inside a booted worker fails the scan instead.
 */
function detectOffThread(
  ctx: ScanContext,
  log: ScanLogger,
  onRule: (progress: RuleProgress) => void
): Promise<ConsistencyFinding[]> {
  if (!existsSync(WORKER_ENTRY)) {
    log.warn('scan worker missing; scanning on the main thread')
    return Promise.resolve(detectInline(ctx, log, onRule))
  }
  return new Promise((resolvePromise, reject) => {
    let booted = false
    let settled = false
    const spawnedAt = performance.now()
    const worker = new Worker(WORKER_ENTRY, {
      execArgv: ['--import', 'tsx'],
      workerData: ctx,
    })
    const name = `worker #${worker.threadId}`
    worker.on('message', (message: ScanWorkerMessage) => {
      switch (message.type) {
        case 'ready':
          booted = true
          log.info(`${name} booted in ${formatMs(performance.now() - spawnedAt)}`)
          break
        case 'progress':
          logRule(log, message)
          onRule(message)
          break
        case 'done':
          settled = true
          log.info(
            `${name} checked ${allRules.length} rules in ${formatMs(message.ms)}: ${message.findings.length} findings`
          )
          resolvePromise(message.findings)
          void worker.terminate()
          break
        default: {
          const unexpected: never = message
          settled = true
          reject(new Error(`Unexpected scan worker message: ${String(unexpected)}`))
          void worker.terminate()
        }
      }
    })
    worker.once('error', (error) => {
      if (settled) return
      settled = true
      if (booted) {
        log.warn(`${name} failed`, error)
        reject(error)
        return
      }
      log.warn(`${name} failed to start; scanning on the main thread`, error)
      try {
        resolvePromise(detectInline(ctx, log, onRule))
      } catch (fallbackError) {
        reject(fallbackError)
      }
    })
    worker.once('exit', (code) => {
      log.debug(`${name} exited with code ${code}`)
      if (settled) return
      settled = true
      reject(new Error(`Scan worker exited with code ${code}`))
    })
  })
}

async function saveSnapshot(
  ctx: ScanContext,
  version: string,
  findings: ConsistencyFinding[],
  durationMs: number
): Promise<void> {
  const { projectId } = ctx
  const snapshot = {
    version,
    sourceLocale: ctx.sourceLocale,
    scannedKeys: ctx.keys.length,
    scannedAt: new Date(),
    durationMs,
  }
  await prisma.$transaction(
    async (tx) => {
      const ignored = ignoredFindingKeys(
        findings,
        await loadIgnoreRows(projectId, tx)
      )
      await tx.consistencySnapshotFinding.deleteMany({ where: { projectId } })
      for (let start = 0; start < findings.length; start += SAVE_BATCH) {
        await tx.consistencySnapshotFinding.createMany({
          data: findings
            .slice(start, start + SAVE_BATCH)
            .map((finding) => snapshotRow(projectId, finding, ignored)),
        })
      }
      await tx.consistencySnapshot.upsert({
        where: { projectId },
        create: { projectId, ...snapshot },
        update: snapshot,
      })
    },
    { timeout: 120_000 }
  )
}

function snapshotRow(
  projectId: number,
  finding: ConsistencyFinding,
  ignored: Set<string>
) {
  return {
    projectId,
    ruleId: finding.ruleId,
    groupId: finding.groupId,
    severity: finding.severity,
    category: finding.category,
    keys: JSON.stringify(finding.keys),
    meta: finding.meta ? JSON.stringify(finding.meta) : null,
    ...findingIndex(finding),
    ignored: ignored.has(findingKey(finding)),
  }
}

/** The whitelisted findings (`findingKey`) — stored as each row's `ignored`. */
function ignoredFindingKeys(
  findings: ConsistencyFinding[],
  ignoreRows: IgnoreRow[]
): Set<string> {
  return new Set(partitionIgnored(findings, ignoreRows).ignored.map(findingKey))
}

/**
 * Stage one after a drawer edit: redo the `key` rules for the edited keys
 * (and their i18next plural siblings, whose findings read the family) and
 * patch the snapshot in place, so a fixed key drops off — or an unfixed one
 * comes back — before the full scan ends. Any `group` finding touching these
 * keys is dropped until that scan rebuilds it. The version stays as it was:
 * the report still reads outdated and the full scan still follows.
 */
export async function recheckSnapshotKeys(
  projectId: number,
  keyIds: number[]
): Promise<void> {
  const snapshot = await prisma.consistencySnapshot.findUnique({
    where: { projectId },
    select: { projectId: true },
  })
  if (!snapshot) return

  const touched = new Set(keyIds)
  const settings = await loadScanSettings(projectId)
  if (dialectSyntax(settings.dialect).pluralKeys) {
    const named = await prisma.i18nKey.findMany({
      where: { projectId, id: { in: keyIds } },
      select: { key: true },
    })
    const siblingNames = [
      ...new Set(
        named.flatMap((row) => {
          const base = pluralBase(row.key)
          return base === null ? [] : pluralSiblingNames(base)
        })
      ),
    ]
    if (siblingNames.length) {
      const siblings = await prisma.i18nKey.findMany({
        where: { projectId, key: { in: siblingNames } },
        select: { id: true },
      })
      for (const sibling of siblings) touched.add(sibling.id)
    }
  }

  const log = scanLogger(projectId)
  const startedAt = performance.now()
  const ctx = await loadScanContext(projectId, [...touched])
  const fresh = detectAll(ctx, {
    rules: keyRules,
    onRule: (rule) => logRule(log, rule),
  })
  const rows = await prisma.consistencySnapshotFinding.findMany({
    where: { projectId },
    select: { id: true, keys: true },
  })
  const stale = rows.flatMap((row) => {
    const members: ConsistencyMember[] = JSON.parse(row.keys)
    return members.some((member) => touched.has(member.keyId)) ? [row.id] : []
  })

  await prisma.$transaction(async (tx) => {
    const ignored = ignoredFindingKeys(
      fresh,
      await loadIgnoreRows(projectId, tx)
    )
    for (let start = 0; start < stale.length; start += SAVE_BATCH) {
      await tx.consistencySnapshotFinding.deleteMany({
        where: { id: { in: stale.slice(start, start + SAVE_BATCH) } },
      })
    }
    await tx.consistencySnapshotFinding.createMany({
      data: fresh.map((finding) => snapshotRow(projectId, finding, ignored)),
    })
  })
  log.info(
    `rechecked ${keyIds.length} keys (+${touched.size - new Set(keyIds).size} plural siblings) on the main thread in ${formatMs(performance.now() - startedAt)}: ${stale.length} rows replaced by ${fresh.length}`
  )
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
