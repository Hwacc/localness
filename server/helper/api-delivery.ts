import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import {
  parseReleaseFilter,
  releaseWhereFragment,
  listReleases,
} from '#server/helper/release'
import { DEFAULT_LOCALE_FALLBACK } from '#shared/constants'

/** Published copy only: the flat `{ key: text }` map the JSON export uses. */
export type DeliveryBundle = Record<string, Record<string, string>>

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

/** Reuses the UI filter fragment so the API and the translations table cannot disagree. */
export function releaseWhere(releaseId: number | null) {
  if (releaseId == null) return {}
  return releaseWhereFragment(parseReleaseFilter({ releaseId }))
}

/**
 * One row per in-scope key, carrying only the requested locales' text. Both read
 * shapes come from here, so a key can never appear in one and not the other.
 *
 * `locale: { in: [...] }` rather than a filter per locale: the bundle needs every
 * locale anyway, and one query beats one per locale for what is the hot path of
 * a runtime consumer.
 */
function publishedKeyRows(
  projectId: number,
  releaseId: number | null,
  locales: string[]
) {
  return prisma.i18nKey.findMany({
    where: { projectId, ...releaseWhere(releaseId) },
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
export async function deliveryMeta(projectId: number, releaseId: number | null) {
  // Resolved before the fan-out because the coverage groupBy filters on it.
  const locales = await projectLocales(projectId)
  const filter = releaseWhere(releaseId)

  const [project, scopedKeys, totalKeys, releases, published] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, settings: true },
    }),
    prisma.i18nKey.count({ where: { projectId, ...filter } }),
    prisma.i18nKey.count({ where: { projectId } }),
    listReleases(projectId),
    prisma.localeValue.groupBy({
      by: ['locale'],
      where: {
        locale: { in: locales },
        i18nKey: { projectId, ...filter },
        ...PUBLISHED_TEXT,
      },
      _count: { _all: true },
    }),
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
    localeFallback:
      project.settings?.localeFallback || DEFAULT_LOCALE_FALLBACK,
    release: releaseId,
    /** The names `?release=` accepts, which a caller cannot otherwise discover. */
    releases,
    coverage: {
      keys: scopedKeys,
      projectKeys: totalKeys,
      publishedPerLocale,
    },
    generatedAt: new Date().toISOString(),
  }
}

/** Missing keys stay missing, so an unpublished key never overrides a fallback. */
export async function deliveryLocale(
  projectId: number,
  locale: string,
  releaseId: number | null
): Promise<Record<string, string>> {
  const rows = await publishedKeyRows(projectId, releaseId, [locale])

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
export async function deliveryRuntime(
  projectId: number,
  releaseId: number | null,
  locales: string[]
): Promise<DeliveryBundle> {
  const rows = await publishedKeyRows(projectId, releaseId, locales)

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
