import { createError, type H3CorsOptions } from 'h3'
import prisma from '#server/libs/prisma'
import {
  parseReleaseFilter,
  releaseWhereFragment,
  listReleases,
} from '#server/helper/release'
import { listNamespaces, namespaceKeyIds } from '#server/helper/namespace'
import { sourceLocaleOf } from '#server/helper/i18n'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'
import { isI18nKeyDraft } from '#shared/utils'
import { isTranslationOutdated } from '#shared/utils/outdated'
import { UNGROUPED_NAMESPACE_PARAM } from '#shared/utils/namespace'
import type {
  DeliveryBundle,
  DeliveryKeyStates,
  DeliveryLocaleStateName,
  DeliveryMeta,
} from '#shared/contract'

export type { DeliveryBundle, DeliveryMeta }

/**
 * What a read is narrowed to. `namespace` is the name the caller asked for (or
 * `__ungrouped__`), echoed by `meta`; `namespaceKeyIds` is its membership,
 * resolved once from key names because SQL `LIKE` cannot express the rule.
 */
export type DeliveryScope = {
  releaseId: number | null
  namespace: string | null
  namespaceKeyIds: number[] | null
}

export const WHOLE_PROJECT: DeliveryScope = {
  releaseId: null,
  namespace: null,
  namespaceKeyIds: null,
}

const DELIVERY_API_PREFIX = '/api/v1/'

export function isDeliveryApiPath(path: string): boolean {
  return path.startsWith(DELIVERY_API_PREFIX)
}

/**
 * Any origin, because the credential is a bearer token and never a cookie: a
 * page that can read the response already had to hold the token. CORS decides
 * what a browser is allowed to *send*, never what a token may *do* — the write
 * routes are gated by the token's scope, and a non-browser caller ignores this
 * header entirely. `content-type` is here because the write routes take JSON and
 * multipart bodies, both of which preflight.
 */
export const DELIVERY_CORS: H3CorsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['authorization', 'content-type'],
}

/**
 * An empty string is not "published empty": `publish` copies a blank draft to
 * `published_text` and a Git overlay writes '' for a cleared cell. Serving it
 * would blank out the consumer's fallback, so it counts as absent.
 */
export function hasPublishedText(
  text: string | null | undefined
): text is string {
  return text != null && text !== ''
}

/** `hasPublishedText` as a Prisma fragment, so the counts cannot drift from it. */
const PUBLISHED_TEXT = {
  AND: [{ publishedText: { not: null } }, { publishedText: { not: '' } }],
}

/** Names-only lists are cheap; these caps keep a 10k-key project from dumping at once. */
export const LIST_KEYS_DEFAULT_LIMIT = 1000
export const LIST_KEYS_MAX_LIMIT = 5000
export const SEARCH_TEXT_DEFAULT_LIMIT = 25

export type SearchTextMode = 'exact' | 'contains'

export type DeliveryKeyPage = {
  keys: string[]
  total: number
  offset: number
  limit: number
}

function clampOffset(offset: number | undefined): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0
  return Math.floor(offset)
}

function clampListLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit) || limit < 1) {
    return LIST_KEYS_DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), LIST_KEYS_MAX_LIMIT)
}

function clampSearchLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit) || limit < 1) {
    return SEARCH_TEXT_DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), SEARCH_TEXT_DEFAULT_LIMIT)
}

/** The published-copy catalog the dictionary tools share with `searchDeliveryKeys`. */
function catalogWhere(projectId: number, scope: DeliveryScope) {
  return {
    projectId,
    locales: { some: PUBLISHED_TEXT },
    ...scopeWhere(scope),
  }
}

/** Locales the project publishes, in the project's own order. */
export async function projectLocales(projectId: number): Promise<string[]> {
  const settings = await prisma.projectSettings.findUnique({
    where: { projectID: projectId },
  })
  const raw = settings?.locales
  if (!Array.isArray(raw)) return []
  return raw.filter((locale): locale is string => typeof locale === 'string')
}

/**
 * `?release=` takes an id or a name, since the caller usually knows the version
 * and not the row id. An unknown name is a 404: returning the whole project
 * instead looks filtered and is not.
 */
export async function resolveReleaseParam(
  projectId: number,
  raw: unknown
): Promise<number | null> {
  if (raw == null || raw === '') return null
  const value = String(raw).trim()
  if (!value) return null

  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  const match = await prisma.projectRelease.findFirst({
    where: { projectId, name: value },
    select: { id: true },
  })
  if (!match) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown release: ${value}`,
    })
  }
  return match.id
}

/** Reuses the UI filter fragments so the API and the translations table cannot disagree. */
export function scopeWhere(scope: DeliveryScope) {
  return {
    ...(scope.releaseId == null
      ? {}
      : releaseWhereFragment(parseReleaseFilter({ releaseId: scope.releaseId }))),
    ...(scope.namespaceKeyIds ? { id: { in: scope.namespaceKeyIds } } : {}),
  }
}

/**
 * `?namespace=` takes a name or an id like `?release=`, plus
 * `__ungrouped__` for the keys in none. Membership is read from key names by
 * the same rule as the Translations list. An unknown name is a 404 for the same
 * reason an unknown release is.
 */
export async function resolveNamespaceParam(
  projectId: number,
  raw: unknown
): Promise<Pick<DeliveryScope, 'namespace' | 'namespaceKeyIds'>> {
  const value = raw == null ? '' : String(raw).trim()
  if (!value) return { namespace: null, namespaceKeyIds: null }
  if (value === UNGROUPED_NAMESPACE_PARAM) {
    return {
      namespace: value,
      namespaceKeyIds: await namespaceKeyIds(projectId, 'ungrouped'),
    }
  }

  const match = await prisma.keyNamespace.findFirst({
    where: {
      projectId,
      // A name may be all digits too, so a number matches either.
      ...(/^\d+$/.test(value)
        ? { OR: [{ id: Number(value) }, { name: value }] }
        : { name: value }),
    },
    orderBy: { id: 'asc' },
    select: { id: true, name: true },
  })
  if (!match) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown namespace: ${value}`,
    })
  }
  return {
    namespace: match.name,
    namespaceKeyIds: await namespaceKeyIds(projectId, { namespaceId: match.id }),
  }
}

/** Both narrowing params at once, the way every read endpoint takes them. */
export async function resolveDeliveryScope(
  projectId: number,
  query: { release?: unknown; namespace?: unknown }
): Promise<DeliveryScope> {
  const [releaseId, namespace] = await Promise.all([
    resolveReleaseParam(projectId, query.release),
    resolveNamespaceParam(projectId, query.namespace),
  ])
  return { releaseId, ...namespace }
}

/**
 * One row per in-scope key, carrying only the requested locales' text. Both read
 * shapes come from here, so a key can never appear in one and not the other.
 *
 * `locale: { in: [...] }` rather than a filter per locale: the bundle needs every
 * locale anyway, and one query beats one per locale on the path a consumer that
 * pulls the whole bundle on every load will hit hardest.
 */
function publishedKeyRows(
  projectId: number,
  scope: DeliveryScope,
  locales: string[]
) {
  return prisma.i18nKey.findMany({
    where: { projectId, ...scopeWhere(scope) },
    orderBy: { key: 'asc' },
    select: {
      key: true,
      locales: {
        where: { locale: { in: locales } },
        select: { locale: true, publishedText: true },
      },
    },
  })
}

/**
 * Coverage for `meta`. A release-filtered bundle is a slice, and the caller
 * cannot tell a small release from an under-tagged one, so the counts are
 * reported rather than inferred — otherwise it renders raw keys.
 */
export async function deliveryMeta(
  projectId: number,
  scope: DeliveryScope,
  canManageReleases = false
): Promise<DeliveryMeta | null> {
  // Resolved before the fan-out because the coverage groupBy filters on it.
  const locales = await projectLocales(projectId)
  const filter = scopeWhere(scope)

  const [project, scopedKeys, totalKeys, releases, namespaces, published, sourceLocale] =
    await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, settings: true },
      }),
      prisma.i18nKey.count({ where: { projectId, ...filter } }),
      prisma.i18nKey.count({ where: { projectId } }),
      listReleases(projectId),
      listNamespaces(projectId),
      prisma.localeValue.groupBy({
        by: ['locale'],
        where: {
          locale: { in: locales },
          i18nKey: { projectId, ...filter },
          ...PUBLISHED_TEXT,
        },
        _count: { _all: true },
      }),
      sourceLocaleOf(projectId),
    ])
  if (!project) return null

  // Keyed off `locales`, not off the grouped rows, so a locale with nothing
  // published still reports 0 instead of going missing from the coverage map.
  const counts = new Map(published.map((row) => [row.locale, row._count._all]))
  const publishedPerLocale: Record<string, number> = {}
  for (const locale of locales) {
    publishedPerLocale[locale] = counts.get(locale) ?? 0
  }

  return {
    project: { id: project.id, name: project.name },
    locales,
    sourceLocale,
    localeFallback:
      project.settings?.localeFallback || DEFAULT_LOCALE_FALLBACK,
    release: scope.releaseId,
    /** The names `?release=` accepts, which a caller cannot otherwise discover. */
    releases,
    namespace: scope.namespace,
    /** The names `?namespace=` accepts, in display order. */
    namespaces,
    coverage: {
      keys: scopedKeys,
      projectKeys: totalKeys,
      publishedPerLocale,
    },
    canManageReleases,
    generatedAt: new Date().toISOString(),
  }
}

/** Missing keys stay missing, so an unpublished key never overrides a fallback. */
export async function deliveryLocale(
  projectId: number,
  locale: string,
  scope: DeliveryScope
): Promise<Record<string, string>> {
  const rows = await publishedKeyRows(projectId, scope, [locale])

  const entries: Record<string, string> = {}
  for (const row of rows) {
    const text = row.locales[0]?.publishedText
    if (!hasPublishedText(text)) continue
    entries[row.key] = text
  }
  return entries
}

/**
 * Every locale in one round trip, from the same rows `deliveryLocale` reads.
 * Locales are emitted in the project's own order and, within each, in key order,
 * so the bundle is byte-stable across calls for a consumer that wants to hash it.
 */
export async function deliveryBundle(
  projectId: number,
  scope: DeliveryScope,
  locales: string[]
): Promise<DeliveryBundle> {
  const rows = await publishedKeyRows(projectId, scope, locales)

  const byLocale = new Map<string, Record<string, string>>()
  for (const row of rows) {
    for (const value of row.locales) {
      if (!hasPublishedText(value.publishedText)) continue
      const entries = byLocale.get(value.locale) ?? {}
      entries[row.key] = value.publishedText
      byLocale.set(value.locale, entries)
    }
  }

  const bundle: DeliveryBundle = {}
  for (const locale of locales) {
    const entries = byLocale.get(locale)
    if (entries) bundle[locale] = entries
  }
  return bundle
}

/**
 * Every key the dictionary publishes, optionally narrowed to one release.
 * Deliberately a superset of the bundle's keys: `catalogWhere` matches "some
 * locale has published text" over all locales, the bundle only over the
 * project's current ones. Extra keys are inert — they cannot appear among the
 * bundle's candidates — but a missing one would fail to break a tie silently.
 */
export async function deliveryKeys(
  projectId: number,
  scope: DeliveryScope
): Promise<string[]> {
  const rows = await prisma.i18nKey.findMany({
    where: catalogWhere(projectId, scope),
    orderBy: { key: 'asc' },
    select: { key: true },
  })
  return rows.map((row) => row.key)
}

/**
 * A single key's published text. `missing` and `unpublished` are different
 * answers on purpose: the first is a caller mistake, the second is a real state
 * of the project, and a consumer that cannot tell them apart renders a blank
 * where it should fall back or report the gap.
 */
export type DeliveryKeyResult =
  | { state: 'published'; text: string }
  | { state: 'unpublished' }
  | { state: 'missing' }

export async function deliveryKey(
  projectId: number,
  key: string,
  locale: string,
  scope: DeliveryScope
): Promise<DeliveryKeyResult> {
  const row = await prisma.i18nKey.findFirst({
    where: { projectId, key, ...scopeWhere(scope) },
    select: {
      locales: { where: { locale }, select: { publishedText: true } },
    },
  })
  if (!row) return { state: 'missing' }

  const value = row.locales[0]?.publishedText
  return hasPublishedText(value)
    ? { state: 'published', text: value }
    : { state: 'unpublished' }
}

/**
 * Keys whose name contains `query`, within scope. Names only — the text is one
 * `deliveryKey` call away, and returning it here would make this the second way
 * to fetch copy.
 *
 * The `locales.some` clause keeps this to keys that have published text
 * somewhere, which is the same set the bundle and per-locale shapes can expose.
 * Without it, search would name keys the rest of the API never mentions.
 */
export async function searchDeliveryKeys(
  projectId: number,
  query: string,
  scope: DeliveryScope,
  limit = 25
): Promise<string[]> {
  const rows = await prisma.i18nKey.findMany({
    where: {
      projectId,
      key: { contains: query },
      locales: { some: PUBLISHED_TEXT },
      ...scopeWhere(scope),
    },
    orderBy: { key: 'asc' },
    take: limit,
    select: { key: true },
  })
  return rows.map((row) => row.key)
}

export type DeliveryLocaleState =
  | { published: true; text: string }
  | { published: false }

export type DeliveryKeyLocalesResult =
  | { state: 'missing' }
  | { state: 'found'; key: string; locales: Record<string, DeliveryLocaleState> }

/**
 * One key across every project locale. Unpublished locales stay in the map
 * as `{ published: false }` so a proofreader can tell absence from omission.
 * Fallback is not merged — the caller already has `localeFallback` from meta.
 */
export async function deliveryKeyLocales(
  projectId: number,
  key: string,
  scope: DeliveryScope
): Promise<DeliveryKeyLocalesResult> {
  const locales = await projectLocales(projectId)
  const row = await prisma.i18nKey.findFirst({
    where: { projectId, key, ...scopeWhere(scope) },
    select: {
      key: true,
      locales: {
        where: { locale: { in: locales } },
        select: { locale: true, publishedText: true },
      },
    },
  })
  if (!row) return { state: 'missing' }

  const byLocale = new Map(
    row.locales.map((value) => [value.locale, value.publishedText])
  )
  const result: Record<string, DeliveryLocaleState> = {}
  for (const locale of locales) {
    const text = byLocale.get(locale)
    result[locale] = hasPublishedText(text)
      ? { published: true, text }
      : { published: false }
  }
  return { state: 'found', key: row.key, locales: result }
}

/** Official catalog key names, paginated. Draft-only keys are not in the catalog. */
export async function listDeliveryKeys(
  projectId: number,
  scope: DeliveryScope,
  offset?: number,
  limit?: number
): Promise<DeliveryKeyPage> {
  const skip = clampOffset(offset)
  const take = clampListLimit(limit)
  const where = catalogWhere(projectId, scope)
  const [total, rows] = await Promise.all([
    prisma.i18nKey.count({ where }),
    prisma.i18nKey.findMany({
      where,
      orderBy: { key: 'asc' },
      skip,
      take,
      select: { key: true },
    }),
  ])
  return { keys: rows.map((row) => row.key), total, offset: skip, limit: take }
}

/**
 * Per-key, per-locale draft/published/outdated state, drafts included. The one
 * read-scope route that exposes draft text; every other delivery shape is
 * published-only. `draft` and `outdated` are judged on all of a key's locales,
 * not just the requested ones, so narrowing `locales` never changes them.
 * Per locale, the first match wins: no published text → `unpublished`; stale
 * against the source sentence → `outdated`; draft differs from published →
 * `draft`; otherwise `published`.
 */
export async function deliveryKeyStates(
  projectId: number,
  scope: DeliveryScope,
  params: { locales?: string[]; offset?: number; limit?: number }
): Promise<DeliveryKeyStates> {
  const skip = clampOffset(params.offset)
  const take = clampListLimit(params.limit)
  const [sourceLocale, configured] = await Promise.all([
    sourceLocaleOf(projectId),
    projectLocales(projectId),
  ])
  const wanted = params.locales?.length ? params.locales : configured
  const where = { projectId, ...scopeWhere(scope) }
  const [total, rows] = await Promise.all([
    prisma.i18nKey.count({ where }),
    prisma.i18nKey.findMany({
      where,
      orderBy: { key: 'asc' },
      skip,
      take,
      select: {
        id: true,
        key: true,
        fingerprint: true,
        releases: { select: { releaseId: true } },
        locales: {
          select: {
            locale: true,
            draftText: true,
            publishedText: true,
            sourceFingerprint: true,
          },
        },
      },
    }),
  ])

  const keys = rows.map((row) => {
    const keyIsDraft = isI18nKeyDraft(row.locales)
    const byLocale = new Map(row.locales.map((value) => [value.locale, value]))
    const locales: DeliveryKeyStates['keys'][number]['locales'] = {}
    for (const locale of wanted) {
      const value = byLocale.get(locale)
      const draftText = value?.draftText ?? null
      const publishedText = value?.publishedText ?? null
      let state: DeliveryLocaleStateName
      if (!hasPublishedText(publishedText)) {
        state = 'unpublished'
      } else if (
        isTranslationOutdated({
          locale,
          sourceLocale,
          draftText,
          publishedText,
          sourceFingerprint: value?.sourceFingerprint ?? '',
          keyFingerprint: row.fingerprint,
          keyIsDraft,
        })
      ) {
        state = 'outdated'
      } else if ((draftText ?? '') !== publishedText) {
        state = 'draft'
      } else {
        state = 'published'
      }
      locales[locale] = { draftText, publishedText, state }
    }
    return {
      id: row.id,
      key: row.key,
      releaseIds: row.releases.map((release) => release.releaseId),
      draft: keyIsDraft,
      locales,
    }
  })

  return {
    sourceLocale,
    keys,
    total,
    offset: skip,
    limit: take,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Keys that are in the official catalog but have no published text in `locale`.
 * "Unpublished" is not "missing": missing means the key is not in scope.
 */
export async function listUnpublishedDeliveryKeys(
  projectId: number,
  locale: string,
  scope: DeliveryScope,
  offset?: number,
  limit?: number
): Promise<DeliveryKeyPage> {
  const skip = clampOffset(offset)
  const take = clampListLimit(limit)
  const where = {
    ...catalogWhere(projectId, scope),
    NOT: {
      locales: {
        some: {
          locale,
          ...PUBLISHED_TEXT,
        },
      },
    },
  }
  const [total, rows] = await Promise.all([
    prisma.i18nKey.count({ where }),
    prisma.i18nKey.findMany({
      where,
      orderBy: { key: 'asc' },
      skip,
      take,
      select: { key: true },
    }),
  ])
  return { keys: rows.map((row) => row.key), total, offset: skip, limit: take }
}

function publishedTextMatch(mode: SearchTextMode, query: string) {
  switch (mode) {
    case 'exact':
      return { publishedText: query }
    case 'contains':
      return { publishedText: { contains: query } }
    default: {
      const exhaustive: never = mode
      throw new Error(`Unhandled search mode: ${exhaustive}`)
    }
  }
}

/**
 * Keys whose published text in `locale` matches `query`. Names only — the
 * text is `deliveryKey` / `deliveryKeyLocales`, so this does not become a
 * second way to fetch copy.
 */
export async function searchDeliveryKeysByText(
  projectId: number,
  locale: string,
  query: string,
  mode: SearchTextMode,
  scope: DeliveryScope,
  limit?: number
): Promise<string[]> {
  const needle = query.trim()
  if (!needle) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Search text must not be empty',
    })
  }

  const rows = await prisma.i18nKey.findMany({
    where: {
      projectId,
      ...scopeWhere(scope),
      locales: {
        some: {
          locale,
          AND: [...PUBLISHED_TEXT.AND, publishedTextMatch(mode, needle)],
        },
      },
    },
    orderBy: { key: 'asc' },
    take: clampSearchLimit(limit),
    select: { key: true },
  })
  return rows.map((row) => row.key)
}
