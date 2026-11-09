import prisma from '#server/libs/prisma'
import { LogAction, LogStatus } from '#shared/constants/log'
import { localeCoverageState } from '#shared/utils/coverage'
import { aiItemId } from '#server/helper/ai-translate-jobs'

export type AiCellReason = 'empty' | 'draft' | 'outdated'

export interface AiCell {
  keyId: number
  locale: string
  reason: AiCellReason
}

export interface AiRange {
  sourceLocale: string
  targetLocales: string[]
  /** Replace a draft someone already wrote. */
  overwriteDraft: boolean
  /** Re-translate published text that lags the source; the result lands as a draft. */
  includePublished: boolean
}

interface RangeKey {
  id: number
  fingerprint?: string
  dirty: boolean
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
    sourceFingerprint?: string
  }>
}

/**
 * Which cells a run may touch, judged per language cell. The source language
 * and a key with no source text are never touched, and neither is published
 * text that still matches its source.
 */
export function selectAiCells(keys: RangeKey[], range: AiRange): AiCell[] {
  const cells: AiCell[] = []
  for (const key of keys) {
    const source = key.locales.find((row) => row.locale === range.sourceLocale)
    if (!(source?.draftText ?? '')) continue
    for (const locale of range.targetLocales) {
      if (locale === range.sourceLocale) continue
      const state = localeCoverageState(key, locale, range.sourceLocale)
      if (state === 'missing') {
        cells.push({ keyId: key.id, locale, reason: 'empty' })
      } else if (state === 'draft' && range.overwriteDraft) {
        cells.push({ keyId: key.id, locale, reason: 'draft' })
      } else if (state === 'outdated') {
        const published = key.locales.find((row) => row.locale === locale)
        const hasPublished = (published?.publishedText ?? '') !== ''
        if (hasPublished ? range.includePublished : range.overwriteDraft) {
          cells.push({ keyId: key.id, locale, reason: 'outdated' })
        }
      }
    }
  }
  return cells
}

/** Local midnight: the daily quota resets with the server's calendar day. */
export function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function clampToQuota(
  requested: number,
  limit: number | null,
  used: number
) {
  if (limit == null) return requested
  return Math.max(0, Math.min(requested, limit - used))
}

/**
 * Cells AI wrote for this project today, counted from the log. A revert does
 * not refund: the model was already paid for.
 */
export async function aiQuota(projectId: number, now = new Date()) {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: { aiDailyLimit: true },
  })
  const limit = settings?.aiDailyLimit ?? null
  const used = await prisma.translationLog.count({
    where: {
      source: 'ai',
      batchId: { not: null },
      status: LogStatus.SUCCESS,
      createdAt: { gte: startOfDay(now) },
      i18nKey: { projectId },
    },
  })
  return { limit, used, remaining: limit == null ? null : Math.max(0, limit - used) }
}

export interface AiWrite {
  keyId: number
  locale: string
  text: string
}

/**
 * Cells planned as empty that someone has filled since. A batch can run for
 * minutes, and what a person typed meanwhile must not be replaced.
 */
export async function filledSincePlanned(
  cells: Array<{ keyId: number; locale: string; reason: AiCellReason }>
) {
  const empty = cells.filter((cell) => cell.reason === 'empty')
  if (!empty.length) return new Set<string>()
  const rows = await prisma.localeValue.findMany({
    where: { OR: empty.map((cell) => ({ i18nKeyId: cell.keyId, locale: cell.locale })) },
    select: { i18nKeyId: true, locale: true, draftText: true, publishedText: true },
  })
  return new Set(
    rows
      .filter((row) => (row.draftText ?? '') !== '' || (row.publishedText ?? '') !== '')
      .map((row) => aiItemId(row.i18nKeyId, row.locale))
  )
}

/** Writes each result as a draft and logs it, so the batch can be reverted. */
export async function applyAiWrites(params: {
  batchId: string
  userId: number | null
  model: string
  writes: AiWrite[]
}) {
  let applied = 0
  for (const write of params.writes) {
    const key = await prisma.i18nKey.findUnique({
      where: { id: write.keyId },
      select: { fingerprint: true },
    })
    if (!key) continue
    const where = {
      i18nKeyId_locale: { i18nKeyId: write.keyId, locale: write.locale },
    }
    const before = await prisma.localeValue.findUnique({ where })
    await prisma.localeValue.upsert({
      where,
      create: {
        i18nKeyId: write.keyId,
        locale: write.locale,
        draftText: write.text,
        publishedText: null,
        sourceFingerprint: key.fingerprint,
      },
      update: { draftText: write.text, sourceFingerprint: key.fingerprint },
    })
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        source: 'ai',
        batchId: params.batchId,
        model: params.model,
        i18nKeyId: write.keyId,
        fingerprint: key.fingerprint,
        userID: params.userId,
        beforeData: {
          locale: write.locale,
          draftText: before?.draftText ?? null,
          sourceFingerprint: before?.sourceFingerprint ?? '',
        },
        afterData: { locale: write.locale, draftText: write.text },
      },
    })
    applied++
  }
  return applied
}

/**
 * Puts back what a batch replaced. A cell whose draft is no longer the AI text
 * was edited since, so it is left alone.
 */
export async function revertAiBatch(
  batchId: string,
  userId: number | null,
  projectId: number
) {
  const logs = await prisma.translationLog.findMany({
    where: { batchId, source: 'ai', status: LogStatus.SUCCESS, i18nKey: { projectId } },
    orderBy: { id: 'desc' },
  })
  let reverted = 0
  let skipped = 0
  for (const log of logs) {
    const before = log.beforeData as {
      locale: string
      draftText: string | null
      sourceFingerprint: string
    } | null
    const after = log.afterData as { locale: string; draftText: string } | null
    if (!before || !after || log.i18nKeyId == null) continue
    const where = {
      i18nKeyId_locale: { i18nKeyId: log.i18nKeyId, locale: after.locale },
    }
    const current = await prisma.localeValue.findUnique({ where })
    if (current?.draftText !== after.draftText) {
      skipped++
      continue
    }
    await prisma.localeValue.update({
      where,
      data: {
        draftText: before.draftText,
        sourceFingerprint: before.sourceFingerprint,
      },
    })
    await prisma.translationLog.create({
      data: {
        action: LogAction.UPDATE,
        status: LogStatus.SUCCESS,
        i18nKeyId: log.i18nKeyId,
        fingerprint: log.fingerprint,
        userID: userId,
        beforeData: after,
        afterData: { locale: after.locale, draftText: before.draftText },
      },
    })
    reverted++
  }
  return { reverted, skipped }
}
