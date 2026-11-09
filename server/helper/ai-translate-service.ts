import prisma from '#server/libs/prisma'
import AgentManager from '#server/libs/agent'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import type { AgentErrorKind } from '#server/libs/agent/AbstractAgent'
import { readClientConfig, resolveModel } from '#server/libs/agent/OpenAIAgent'
import { projectLocales } from '#server/helper/api-delivery'
import { loadScanSettings } from '#server/helper/consistency'
import { sourceLocaleOf } from '#server/helper/i18n'
import {
  aiQuota,
  clampToQuota,
  selectAiCells,
} from '#server/helper/ai-translate'
import type { AiGate, AiPlanItem } from '#server/helper/ai-translate-jobs'
import { createAiTranslateJobs } from '#server/helper/ai-translate-jobs'
import { isI18nKeyDraft } from '#shared/utils'
import { gateTranslation } from '#shared/utils/consistency'
import type { ScanSettings } from '#shared/utils/consistency'
import { AI_TRANSLATE_MAX_CELLS } from '#shared/schemas'
import type { ZAiTranslateCreate } from '#shared/schemas'

const DEFAULT_CONCURRENCY = 2
/** Other languages sent along as terminology hints; more only costs tokens. */
const MAX_OTHER_LOCALES = 3

function readConcurrency(env: NodeJS.ProcessEnv = process.env) {
  const value = Number.parseInt(env.NUXT_AI_TRANSLATE_CONCURRENCY ?? '', 10)
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_CONCURRENCY
}

export const aiTranslateJobs = createAiTranslateJobs({
  translate: (params) => AgentManager.translate(params),
  concurrency: readConcurrency(),
})

const AGENT_ERROR_STATUS: Record<AgentErrorKind, number> = {
  quota: 402,
  upstream: 502,
  config: 500,
  'bad-params': 400,
}

/** Keeps the provider's reason visible; Nitro hides unhandled error messages. */
export function rethrowAiAsHttp(error: unknown): never {
  if (error instanceof AgentError) {
    throw createError({
      statusCode: AGENT_ERROR_STATUS[error.kind],
      statusMessage: 'AI translation failed',
      message: error.message,
      data: { kind: error.kind },
    })
  }
  throw error
}

/** The project switch and the instance's model credentials, both required. */
export async function requireAiTranslate(projectId: number) {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: { aiTranslate: true },
  })
  if (!settings?.aiTranslate) {
    throw createError({
      statusCode: 403,
      statusMessage: 'AI translation is off for this project',
    })
  }
  if (!readClientConfig('translation')) {
    throw createError({
      statusCode: 503,
      statusMessage: 'AI translation is not configured on this server',
    })
  }
  return { model: resolveModel('translation') }
}

export function gateFor(
  sourceLocale: string,
  settings: ScanSettings
): AiGate {
  return (item, text) =>
    gateTranslation(
      {
        source: item.source,
        sourceLocale,
        targetLocale: item.locale,
        text,
      },
      settings
    )
}

export function loadGate(projectId: number, sourceLocale: string) {
  return loadScanSettings(projectId).then((settings) =>
    gateFor(sourceLocale, settings)
  )
}

/**
 * The cells a request would translate, cut to the batch cap and to what the
 * day's quota still allows. `capped` is how many eligible cells were left out.
 */
export async function loadAiPlan(
  projectId: number,
  body: ZAiTranslateCreate
) {
  const [sourceLocale, configured] = await Promise.all([
    sourceLocaleOf(projectId),
    projectLocales(projectId),
  ])
  const unknown = body.locales.filter((locale) => !configured.includes(locale))
  if (unknown.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Not a language of this project: ${unknown.join(', ')}`,
    })
  }
  const rows = await prisma.i18nKey.findMany({
    where: { projectId, id: { in: body.keyIds } },
    select: {
      id: true,
      key: true,
      fingerprint: true,
      locales: {
        select: {
          locale: true,
          draftText: true,
          publishedText: true,
          sourceFingerprint: true,
        },
      },
    },
  })
  const keys = rows.map((row) => ({
    ...row,
    dirty: isI18nKeyDraft(row.locales),
  }))
  const cells = selectAiCells(keys, {
    sourceLocale,
    targetLocales: body.locales,
    overwriteDraft: body.overwriteDraft,
    includePublished: body.includePublished,
  })
  const quota = await aiQuota(projectId)
  const allowed = Math.min(
    AI_TRANSLATE_MAX_CELLS,
    clampToQuota(cells.length, quota.limit, quota.used)
  )
  const byId = new Map(keys.map((key) => [key.id, key]))
  const plan: AiPlanItem[] = cells.slice(0, allowed).map((cell) => {
    const key = byId.get(cell.keyId)!
    const text = (locale: string) => {
      const row = key.locales.find((one) => one.locale === locale)
      return row?.draftText || row?.publishedText || ''
    }
    const other = Object.fromEntries(
      key.locales
        .filter((row) => row.locale !== sourceLocale && row.locale !== cell.locale)
        .map((row) => [row.locale, text(row.locale)] as const)
        .filter(([, value]) => value)
        .slice(0, MAX_OTHER_LOCALES)
    )
    return {
      keyId: key.id,
      key: key.key,
      locale: cell.locale,
      reason: cell.reason,
      source: text(sourceLocale),
      ...(Object.keys(other).length ? { other } : {}),
    }
  })
  return {
    sourceLocale,
    plan,
    eligible: cells.length,
    capped: cells.length - plan.length,
    quota,
  }
}
