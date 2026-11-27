import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import { LogAction, LogStatus } from '#shared/constants/log'
import { fpTranslation, isUnnamedKey, UNNAMED_KEY_PREFIX } from '#shared/utils'
import type { KeyDraftConflict, KeyWriteResult } from '#shared/contract'
import { keyClashMessage, toKeyConvention } from '#server/helper/key-convention'
import {
  KEY_VIOLATION_TEXT,
  checkI18nKey,
  keyViolationErrors,
} from '#shared/utils/key-convention'
import {
  sourceLocaleOf,
  sourceTextOf,
  upsertLocaleDrafts,
  writeSourceText,
} from '#server/helper/i18n'
import {
  DELIVERY_KEY_STATE_SELECT,
  deliveryKeyState,
  projectLocales,
} from '#server/helper/api-delivery'
import {
  assertReleaseIdsInProject,
  throwReleaseHttp,
} from '#server/helper/release'

/**
 * The key writes behind `/api/v1/keys`: what an IDE plugin needs to turn text in
 * code into a key and to edit a key's wording. A new named key publishes its
 * source text: that text is already live in the code it came from, and an
 * unpublished key would make the app show the key name. Every edit lands in
 * drafts only — the web app's publish button stays the one way an edit reaches
 * `/bundle`. Both answer in the `/keys/states` shape. Kept out of the routes so
 * they can be unit tested without a request.
 */

/** Every project locale, source first if the settings forgot it. */
async function stateLocales(projectId: number, sourceLocale: string) {
  const configured = await projectLocales(projectId)
  return configured.includes(sourceLocale)
    ? configured
    : [sourceLocale, ...configured]
}

/**
 * A new name must not break the project's convention, the rule import and the
 * clients' own checks apply. Only errors refuse it: style warnings are advice,
 * since legacy projects rarely followed one. Names the project already has are
 * never checked.
 */
async function assertKeyConvention(projectId: number, key: string) {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
    select: {
      keyPrefix: true,
      keySeparator: true,
      keyStyle: true,
      keyMaxDepth: true,
    },
  })
  const violations = keyViolationErrors(
    checkI18nKey(key, toKeyConvention(settings)),
  )
  if (violations.length === 0) return
  throw createError({
    statusCode: 400,
    statusMessage: `"${key}" breaks the project's key convention: ${violations
      .map((violation) => KEY_VIOLATION_TEXT[violation].toLowerCase())
      .join('; ')}`,
  })
}

export const CLIENT_HEADER = 'x-localness-client'

/** The tool behind a token write, for the key's history. */
export interface WriteClient {
  client: string | null
  agent: boolean
}

const CLIENT_PATTERN = /^([a-z][a-z0-9-]{0,31}\/[\w.+-]{1,32})\s*(;\s*agent)?$/i

/**
 * `X-Localness-Client: cli/0.1.0; agent`, as the SDK sends it. Self-reported,
 * so a label in the history and never a permission; anything else, or no
 * header, records nothing rather than echoing arbitrary text into the log.
 */
export function writeClientOf(header: string | undefined): WriteClient {
  const match = header?.trim().match(CLIENT_PATTERN)
  if (!match) return { client: null, agent: false }
  return { client: match[1]!, agent: Boolean(match[2]) }
}

async function loadKeyState(id: number) {
  return prisma.i18nKey.findUniqueOrThrow({
    where: { id },
    select: DELIVERY_KEY_STATE_SELECT,
  })
}

/**
 * Text found in code becomes a key whose source-language text is that text,
 * published when the key is named. Without a name the key is the text's
 * `__unnamed_` placeholder, a draft only, and the same
 * text asked twice gets the same key back (`created: false`) rather than a 409:
 * a plugin extracting a repeated string should land on one entry. A name the
 * project already has is a clash, worded like the web app's.
 */
export async function createKeyFromSource(params: {
  projectId: number
  userId: number
  via?: WriteClient
  key?: string
  sourceText: string
  releaseId?: number
}): Promise<KeyWriteResult> {
  const sourceText = params.sourceText.trim()
  const named = params.key?.trim() || undefined
  if (named && isUnnamedKey(named)) {
    throw createError({
      statusCode: 400,
      statusMessage: `"${UNNAMED_KEY_PREFIX}" is reserved for unnamed keys; omit the key instead`,
    })
  }
  if (params.releaseId !== undefined) {
    await assertReleaseIdsInProject({
      projectId: params.projectId,
      releaseIds: [params.releaseId],
    }).catch(throwReleaseHttp)
  }
  const sourceLocale = await sourceLocaleOf(params.projectId)
  const wanted = await stateLocales(params.projectId, sourceLocale)
  const fingerprint = fpTranslation(sourceText)
  const name = named ?? `${UNNAMED_KEY_PREFIX}${fingerprint}`

  const existing = await prisma.i18nKey.findUnique({
    where: { projectId_key: { projectId: params.projectId, key: name } },
    select: DELIVERY_KEY_STATE_SELECT,
  })
  if (existing && !named) {
    return {
      sourceLocale,
      created: false,
      key: deliveryKeyState(existing, sourceLocale, wanted),
    }
  }
  if (existing) {
    await prisma.translationLog.create({
      data: {
        action: LogAction.CREATE,
        status: LogStatus.REFUSED,
        beforeData: existing,
        i18nKeyId: existing.id,
        fingerprint,
        userID: params.userId,
        ...params.via,
      },
    })
    throw createError({
      statusCode: 409,
      statusMessage: keyClashMessage(
        {
          key: existing.key,
          sourceText: sourceTextOf(existing.locales, sourceLocale),
        },
        sourceText,
      ),
    })
  }
  if (named) await assertKeyConvention(params.projectId, named)

  const record = await prisma.i18nKey.create({
    data: {
      projectId: params.projectId,
      key: name,
      fingerprint,
      ...(params.releaseId !== undefined && {
        releases: { create: { releaseId: params.releaseId } },
      }),
    },
    select: { id: true },
  })
  await writeSourceText({
    projectId: params.projectId,
    i18nKeyId: record.id,
    text: sourceText,
    sourceLocale,
    publish: Boolean(named),
  })
  const loaded = await loadKeyState(record.id)
  await prisma.translationLog.create({
    data: {
      action: LogAction.CREATE,
      status: LogStatus.SUCCESS,
      afterData: loaded,
      i18nKeyId: record.id,
      fingerprint,
      userID: params.userId,
      ...params.via,
    },
  })
  return {
    sourceLocale,
    created: true,
    key: deliveryKeyState(loaded, sourceLocale, wanted),
  }
}

/**
 * Draft edits for one key, any locale, published or not — a published key keeps
 * serving its published text until someone publishes again in the web app.
 *
 * Optimistic, per locale: `expected` is the draft the caller last read. One
 * stale locale refuses the whole request with a 409 carrying the current state,
 * so nothing is half-written and the caller can diff before retrying.
 *
 * A source change re-fingerprints the key *before* any other locale is written,
 * the web editor's order: translations sent alongside the new wording are
 * stamped against it, and the ones left alone turn outdated.
 */
export async function updateKeyDrafts(params: {
  projectId: number
  userId: number
  via?: WriteClient
  key: string
  locales: Record<string, { text: string; expected: string }>
}): Promise<KeyWriteResult> {
  const sourceLocale = await sourceLocaleOf(params.projectId)
  const wanted = await stateLocales(params.projectId, sourceLocale)
  const unknown = Object.keys(params.locales).filter(
    (locale) => !wanted.includes(locale),
  )
  if (unknown.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown locale: ${unknown.join(', ')}`,
    })
  }
  const edits = Object.fromEntries(
    Object.entries(params.locales).map(([locale, edit]) => [
      locale,
      locale === sourceLocale ? edit.text.trim() : edit.text,
    ]),
  )
  if (sourceLocale in edits && !edits[sourceLocale]) {
    throw createError({ statusCode: 400, statusMessage: 'Missing source text' })
  }

  const existing = await prisma.i18nKey.findUnique({
    where: { projectId_key: { projectId: params.projectId, key: params.key } },
    select: DELIVERY_KEY_STATE_SELECT,
  })
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Key not found' })
  }

  const drafts = new Map(
    existing.locales.map((value) => [value.locale, value.draftText ?? '']),
  )
  const stale = Object.entries(params.locales)
    .filter(([locale, edit]) => (drafts.get(locale) ?? '') !== edit.expected)
    .map(([locale]) => locale)
  if (stale.length) {
    const data: KeyDraftConflict = {
      locales: stale,
      key: deliveryKeyState(existing, sourceLocale, wanted),
    }
    throw createError({
      statusCode: 409,
      statusMessage: `Draft changed since it was read: ${stale.join(', ')}`,
      data,
    })
  }

  const changed = Object.entries(edits).filter(
    ([locale, text]) => (drafts.get(locale) ?? '') !== text,
  )
  if (!changed.length) {
    return {
      sourceLocale,
      created: false,
      key: deliveryKeyState(existing, sourceLocale, wanted),
    }
  }

  const sourceText = changed.find(([locale]) => locale === sourceLocale)?.[1]
  const fingerprint = sourceText
    ? fpTranslation(sourceText)
    : existing.fingerprint
  if (sourceText) {
    await prisma.i18nKey.update({
      where: { id: existing.id },
      data: { fingerprint },
    })
  }
  await upsertLocaleDrafts(
    existing.id,
    Object.fromEntries(changed.filter(([locale]) => locale !== sourceLocale)),
  )
  if (sourceText) {
    await writeSourceText({
      projectId: params.projectId,
      i18nKeyId: existing.id,
      text: sourceText,
      sourceLocale,
    })
  }
  const loaded = await loadKeyState(existing.id)
  await prisma.translationLog.create({
    data: {
      action: LogAction.UPDATE,
      status: LogStatus.SUCCESS,
      beforeData: existing,
      afterData: loaded,
      i18nKeyId: existing.id,
      fingerprint,
      userID: params.userId,
      ...params.via,
    },
  })
  return {
    sourceLocale,
    created: false,
    key: deliveryKeyState(loaded, sourceLocale, wanted),
  }
}
