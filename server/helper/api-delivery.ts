import prisma from '#server/libs/prisma'
import {
  parseReleaseFilter,
  releaseWhereFragment,
  listReleases,
} from '#server/helper/release'
import { ApiTokenError } from '#server/helper/api-token'
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
    throw new ApiTokenError(404, `Unknown release: ${value}`)
  }
  return match.id
}

/** Reuses the UI filter fragment so the API and the translations table cannot disagree. */
export function releaseWhere(releaseId: number | null) {
  if (releaseId == null) return {}
  return releaseWhereFragment(parseReleaseFilter({ releaseId }))
}

/**
 * Coverage for `meta`. A release-filtered bundle is a slice, and the caller
 * cannot tell a small release from an under-tagged one, so the counts are
 * reported rather than inferred — otherwise it renders raw keys.
 */
export async function deliveryMeta(projectId: number, releaseId: number | null) {
  const filter = releaseWhere(releaseId)
  const [project, locales, scopedKeys, totalKeys, releases] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, settings: true },
    }),
    projectLocales(projectId),
    prisma.i18nKey.count({ where: { projectId, ...filter } }),
    prisma.i18nKey.count({ where: { projectId } }),
    listReleases(projectId),
  ])
  if (!project) return null

  const publishedPerLocale: Record<string, number> = {}
  for (const locale of locales) {
    publishedPerLocale[locale] = await prisma.localeValue.count({
      where: {
        locale,
        i18nKey: { projectId, ...filter },
        ...PUBLISHED_TEXT,
      },
    })
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
  const rows = await prisma.i18nKey.findMany({
    where: { projectId, ...releaseWhere(releaseId) },
    orderBy: { key: 'asc' },
    select: {
      key: true,
      locales: {
        where: { locale },
        select: { publishedText: true },
      },
    },
  })

  const entries: Record<string, string> = {}
  for (const row of rows) {
    const text = row.locales[0]?.publishedText
    if (!hasPublishedText(text)) continue
    entries[row.key] = text
  }
  return entries
}

/** Every locale in one round trip, built from `deliveryLocale` so the two agree. */
export async function deliveryRuntime(
  projectId: number,
  releaseId: number | null,
  locales: string[]
): Promise<DeliveryBundle> {
  const bundle: DeliveryBundle = {}
  for (const locale of locales) {
    const entries = await deliveryLocale(projectId, locale, releaseId)
    if (Object.keys(entries).length) bundle[locale] = entries
  }
  return bundle
}
