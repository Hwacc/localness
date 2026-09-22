import type { I18nKeySuggestion } from '#shared/types'
import type { AgentErrorKind } from '#server/libs/agent/AbstractAgent'
import AgentManager from '#server/libs/agent'
import { AgentError } from '#server/libs/agent/AbstractAgent'
import prisma from '#server/libs/prisma'
import { sourceLocaleOf, sourceTextOf } from '#server/helper/i18n'
import {
  resolveKeyConvention,
  shapeKeyDuplicates,
} from '#server/helper/key-convention'

const CONVENTION_COLUMNS = {
  keyPrefix: true,
  keySeparator: true,
  keyStyle: true,
  keyMaxDepth: true,
  // Read here rather than required from the caller: this route family already
  // reads the row, and a prompt the callers cannot lie about is one less way
  // for the model's instructions to drift from the rules it will be judged by.
  prompt: true,
} as const

/**
 * A provider refusal is not our server crashing: keep the upstream reason on
 * `message` so it survives Nitro's production sanitizing of unhandled errors.
 */
const AGENT_ERROR_STATUS: Record<AgentErrorKind, number> = {
  quota: 402,
  upstream: 502,
  config: 500,
  'bad-params': 400,
}

/** Maps a failed generation onto the status the browser sees. Never returns. */
export function rethrowAsHttp(error: unknown): never {
  if (error instanceof AgentError) {
    throw createError({
      statusCode: AGENT_ERROR_STATUS[error.kind],
      statusMessage: 'Failed to generate i18n key',
      message: error.message,
      data: { kind: error.kind },
    })
  }
  throw error
}

export type KeySuggestionParams = {
  projectId: number
  /**
   * Only a tag-scoped call has one. An entry is not page-scoped — its tags can
   * sit on several pages, so picking one of them would be arbitrary.
   */
  pageID?: number | null
  origin: string
  prompts?: {
    project?: string | null
    page?: string | null
    tag?: string | null
  }
}

/**
 * What every AI naming route does: read the convention for wherever the call
 * came from, ask the agent, then check the answer against the project's
 * vocabulary.
 *
 * Shared rather than duplicated because the three parts have to agree — a route
 * that read the convention differently from the one that checked the answer
 * would hand the model and the validator different rules.
 */
export async function buildKeySuggestion(
  params: KeySuggestionParams
): Promise<I18nKeySuggestion> {
  const [pageSettings, projectSettings] = await Promise.all([
    params.pageID
      ? prisma.pageSettings.findUnique({
          where: { pageID: params.pageID },
          select: CONVENTION_COLUMNS,
        })
      : null,
    prisma.projectSettings.findUnique({
      where: { projectID: params.projectId },
      select: CONVENTION_COLUMNS,
    }),
  ])

  const result = await AgentManager.generateI18nKey({
    // A caller that knows the surrounding context wins; otherwise the project's
    // own prompt applies, which is the only guidance an entry has.
    projectPrompt: params.prompts?.project ?? projectSettings?.prompt ?? null,
    pagePrompt: params.prompts?.page ?? null,
    pageImage: null,
    tagOrigin: params.origin,
    tagI18nKey: null,
    tagPrompt: params.prompts?.tag ?? null,
    convention: resolveKeyConvention(pageSettings, projectSettings),
  })

  // Whether the key is already in the project is a fact about the project, not
  // about the convention, so the agent does not know it and the answer is
  // checked here — over every candidate, not just the primary.
  const candidates = [
    result.key,
    ...(result.alternatives ?? []).map((one) => one.key),
  ].filter((key) => key !== '')
  const sourceLocale = await sourceLocaleOf(params.projectId)
  const existing = candidates.length
    ? await prisma.i18nKey.findMany({
        where: { projectId: params.projectId, key: { in: candidates } },
        select: {
          key: true,
          locales: {
            where: { locale: sourceLocale },
            select: { locale: true, draftText: true },
          },
        },
      })
    : []

  return {
    ...result,
    // What a candidate would reuse is the text that key holds, which lives in the
    // project's source language.
    duplicates: shapeKeyDuplicates(
      existing.map((row) => ({
        key: row.key,
        origin: sourceTextOf(row.locales, sourceLocale),
      })),
      params.origin
    ),
  }
}
