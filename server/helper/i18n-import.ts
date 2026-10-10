import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import { toKeyConvention } from '#server/helper/key-convention'
import { setReleaseMembership } from '#server/helper/release'
import { LogAction, LogStatus } from '#shared/constants/log'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import { DRAFT_KEY_PREFIX, fpTranslation, parseLocales } from '#shared/utils'
import {
  checkI18nKey,
  type KeyConvention,
} from '#shared/utils/key-convention'
import {
  detectInterpolationStyles,
  emptyEntries,
  normalizeImportText,
} from '#shared/utils/i18n-import'
import type {
  I18nImportRowKind,
  II18nImportChange,
  II18nImportPreview,
  II18nImportResult,
  II18nImportRow,
} from '#shared/types/I18nKey'

/**
 * Import of existing locale files. The copy being imported is already live in
 * someone's app, so it lands published on both sides, and a new key stays out
 * of Git sync until someone opts it in — it did not come from the Git remote.
 *
 * Preview and apply both run `classifyImport` on the same payload; apply does
 * not trust a classification the client carried over, since the project may
 * have changed in between.
 */

export class ImportError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ImportError'
  }
}

export function throwImportHttp(error: unknown): never {
  if (error instanceof ImportError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

/** `locale → key → text`, as the client sends it after the user mapped each file or column. */
export type ImportPayload = Record<string, Record<string, string>>

export type ImportExistingKey = {
  id: number
  key: string
  locales: Array<{
    locale: string
    draftText: string | null
    publishedText: string | null
  }>
}

/** Incoming text per key, locales the project lacks dropped, empty text dropped. */
function textsByKey(
  payload: ImportPayload,
  projectLocales: string[]
): { byKey: Map<string, Record<string, string>>; ignoredLocales: string[] } {
  const configured = new Set(projectLocales)
  const ignoredLocales: string[] = []
  const byKey = new Map<string, Record<string, string>>()
  for (const [locale, entries] of Object.entries(payload)) {
    if (!configured.has(locale)) {
      ignoredLocales.push(locale)
      continue
    }
    for (const [rawKey, rawText] of Object.entries(entries)) {
      const key = rawKey.trim()
      const text = normalizeImportText(rawText)
      let texts = byKey.get(key)
      if (!texts) {
        texts = emptyEntries()
        byKey.set(key, texts)
      }
      if (text !== null) texts[locale] = text
    }
  }
  return { byKey, ignoredLocales }
}

function hasUnpublishedDraft(locales: ImportExistingKey['locales']): boolean {
  return locales.some(
    (row) => (row.draftText ?? '') !== (row.publishedText ?? '')
  )
}

/**
 * Pure: what importing `payload` would do to a project holding `existing`.
 *
 * A key with no text in the source language is skipped unless the project
 * already holds its original text: importing only `zh-CN.json` to fill in the
 * translations of keys that exist is the common case, not an error.
 */
export function classifyImport(input: {
  payload: ImportPayload
  projectLocales: string[]
  sourceLocale: string
  existing: ImportExistingKey[]
  convention: KeyConvention
}): II18nImportPreview {
  const { byKey, ignoredLocales } = textsByKey(
    input.payload,
    input.projectLocales
  )
  const existingByKey = new Map(input.existing.map((row) => [row.key, row]))
  const preview: II18nImportPreview = {
    sourceLocale: input.sourceLocale,
    rows: [],
    skipped: [],
    ignoredLocales,
    counts: { new: 0, same: 0, changed: 0, skipped: 0 },
    interpolationStyles: [],
  }
  const allTexts: string[] = []

  for (const [key, texts] of byKey) {
    const locales = Object.keys(texts)
    if (!locales.length) continue
    if (!key) {
      preview.skipped.push({ key, reason: 'empty-key' })
      continue
    }
    if (key.startsWith(DRAFT_KEY_PREFIX)) {
      preview.skipped.push({ key, reason: 'reserved-prefix' })
      continue
    }

    const existing = existingByKey.get(key)
    const storedSource = existing?.locales.find(
      (row) => row.locale === input.sourceLocale
    )?.draftText
    if (!texts[input.sourceLocale] && !storedSource?.trim()) {
      preview.skipped.push({ key, reason: 'no-source-text' })
      continue
    }

    const changes: II18nImportChange[] = []
    if (existing) {
      for (const locale of locales) {
        const text = texts[locale]!
        const stored = existing.locales.find((row) => row.locale === locale)
        if (stored?.draftText === text && stored.publishedText === text) continue
        changes.push({
          locale,
          before: stored?.publishedText ?? stored?.draftText ?? null,
          after: text,
        })
      }
    }

    const kind: I18nImportRowKind = !existing
      ? 'new'
      : changes.length
        ? 'changed'
        : 'same'
    const row: II18nImportRow = {
      key,
      kind,
      texts: { ...texts },
      changes,
      hasUnpublishedDraft: existing ? hasUnpublishedDraft(existing.locales) : false,
      violations: checkI18nKey(key, input.convention),
    }
    preview.rows.push(row)
    preview.counts[kind] += 1
    allTexts.push(...Object.values(texts))
  }

  preview.counts.skipped = preview.skipped.length
  preview.interpolationStyles = detectInterpolationStyles(allTexts)
  return preview
}

async function loadImportContext(projectId: number) {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: {
      locales: true,
      localeFallback: true,
      keyPrefix: true,
      keySeparator: true,
      keyStyle: true,
      keyMaxDepth: true,
    },
  })
  // The whole project rather than `key: { in }`: an import can name thousands
  // of keys, more than one SQLite statement binds.
  const existing = await prisma.i18nKey.findMany({
    where: { projectId },
    select: {
      id: true,
      key: true,
      fingerprint: true,
      locales: {
        select: { locale: true, draftText: true, publishedText: true },
      },
    },
  })
  return {
    projectLocales: parseLocales(settings?.locales),
    sourceLocale: settings?.localeFallback || DEFAULT_LOCALE_FALLBACK,
    convention: toKeyConvention(settings),
    existing,
  }
}

export async function previewImport(params: {
  projectId: number
  payload: ImportPayload
}): Promise<II18nImportPreview> {
  const context = await loadImportContext(params.projectId)
  return classifyImport({ payload: params.payload, ...context })
}

export async function applyImport(params: {
  projectId: number
  userId: number
  payload: ImportPayload
  overwriteKeys: string[]
  releaseId?: number
}): Promise<II18nImportResult> {
  if (params.releaseId !== undefined) {
    const release = await prisma.projectRelease.findFirst({
      where: { id: params.releaseId, projectId: params.projectId },
      select: { id: true },
    })
    if (!release) throw new ImportError(404, 'Release not found')
  }

  const context = await loadImportContext(params.projectId)
  const preview = classifyImport({ payload: params.payload, ...context })
  const existingByKey = new Map(context.existing.map((row) => [row.key, row]))
  const existingIdByKey = new Map(
    context.existing.map((row) => [row.key, row.id])
  )
  const overwrite = new Set(params.overwriteKeys)
  const result: II18nImportResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: preview.counts.skipped,
    releaseLinked: 0,
  }

  let importedIds: number[]
  try {
    importedIds = await prisma.$transaction(
      async (tx) => {
        const ids: number[] = []
        for (const row of preview.rows) {
          switch (row.kind) {
            case 'new': {
              const created = await tx.i18nKey.create({
                data: {
                  projectId: params.projectId,
                  key: row.key,
                  fingerprint: fpTranslation(row.texts[preview.sourceLocale]!),
                  gitSyncEnabled: false,
                  locales: {
                    create: Object.entries(row.texts).map(([locale, text]) => ({
                      locale,
                      draftText: text,
                      publishedText: text,
                      ...(locale === preview.sourceLocale
                        ? {}
                        : {
                            sourceFingerprint: fpTranslation(row.texts[preview.sourceLocale]!),
                          }),
                    })),
                  },
                },
                select: { id: true },
              })
              ids.push(created.id)
              result.created += 1
              break
            }
            case 'changed': {
              const i18nKeyId = existingIdByKey.get(row.key)!
              ids.push(i18nKeyId)
              if (!overwrite.has(row.key)) {
                result.unchanged += 1
                break
              }
              const source = row.changes.find(
                (change) => change.locale === preview.sourceLocale
              )
              const fingerprint = source
                ? fpTranslation(source.after)
                : (existingByKey.get(row.key)?.fingerprint ?? '')
              if (source) {
                await tx.i18nKey.update({
                  where: { id: i18nKeyId },
                  data: { fingerprint },
                })
              }
              for (const change of row.changes) {
                const stamp =
                  change.locale === preview.sourceLocale ? {} : { sourceFingerprint: fingerprint }
                await tx.localeValue.upsert({
                  where: {
                    i18nKeyId_locale: { i18nKeyId, locale: change.locale },
                  },
                  create: {
                    i18nKeyId,
                    locale: change.locale,
                    draftText: change.after,
                    publishedText: change.after,
                    ...stamp,
                  },
                  update: { draftText: change.after, publishedText: change.after, ...stamp },
                })
              }
              result.updated += 1
              break
            }
            case 'same':
              ids.push(existingIdByKey.get(row.key)!)
              result.unchanged += 1
              break
            default: {
              const unreachable: never = row.kind
              throw new Error(`Unknown import row kind: ${unreachable}`)
            }
          }
        }
        return ids
      },
      // One transaction for the batch, so a failure leaves the project as it was.
      { timeout: 120_000 }
    )
  } catch (error) {
    await prisma.projectLog.create({
      data: {
        action: LogAction.IMPORT,
        status: LogStatus.FAILED,
        projectID: params.projectId,
        userID: params.userId,
      },
    })
    throw error
  }

  // Every key the file names, unchanged ones included: the label says which
  // copy shipped in that version, not which rows this import rewrote.
  if (params.releaseId !== undefined && importedIds.length) {
    const linked = await setReleaseMembership({
      projectId: params.projectId,
      releaseId: params.releaseId,
      kind: 'key',
      ids: importedIds,
      mode: 'add',
    })
    result.releaseLinked = linked.changed
  }

  await prisma.projectLog.create({
    data: {
      action: LogAction.IMPORT,
      status: LogStatus.SUCCESS,
      projectID: params.projectId,
      userID: params.userId,
      afterData: { ...result, ignoredLocales: preview.ignoredLocales },
    },
  })
  return result
}
