import prisma from '#server/libs/prisma'
import {
  parseReleaseFilter,
  releaseWhereFragment,
  type ReleaseFilter,
} from '#server/helper/release'
import {
  namespaceKeyIds,
  parseNamespaceFilter,
  type NamespaceFilter,
} from '#server/helper/namespace'
import { I18nKeyStatusFilter } from '#shared/constants'
import { LEGACY_DRAFT_KEY_PREFIX, UNNAMED_KEY_PREFIX } from '#shared/utils'
import type { Prisma } from '~~/prisma/client/client'

/** Placeholder keys under either prefix; the pair is what `isUnnamedKey` tests. */
export const UNNAMED_KEYS_WHERE: Prisma.I18nKeyWhereInput = {
  OR: [
    { key: { startsWith: UNNAMED_KEY_PREFIX } },
    { key: { startsWith: LEGACY_DRAFT_KEY_PREFIX } },
  ],
}

/**
 * The Translations list filters, shared by the paged list and the namespace
 * counts so a count always means "rows you would see after clicking it".
 */

/**
 * Mirrors `isI18nKeyDraft` in SQL. A key is draft when it has no locale rows,
 * when nothing is published yet, or when any locale's draft differs from what
 * is published. The comparison spans two columns, so Prisma's `where` cannot
 * express it and filtering client-side would break pagination.
 */
const DRAFT_PREDICATE = `
  NOT EXISTS (
    SELECT 1 FROM "LocaleValue" lv
    WHERE lv."i18n_key_id" = k."id"
      AND COALESCE(lv."published_text", '') != ''
  )
  OR EXISTS (
    SELECT 1 FROM "LocaleValue" lv
    WHERE lv."i18n_key_id" = k."id"
      AND COALESCE(lv."draft_text", '') != COALESCE(lv."published_text", '')
  )
`

/** A published key with a non-source translation written against an older source sentence. */
const OUTDATED_PREDICATE = `
  NOT (${DRAFT_PREDICATE})
  AND EXISTS (
    SELECT 1 FROM "LocaleValue" lv
    JOIN "ProjectSettings" ps ON ps."project_id" = k."project_id"
    WHERE lv."i18n_key_id" = k."id"
      AND lv."locale" != ps."locale_fallback"
      AND (
        COALESCE(lv."draft_text", '') != ''
        OR COALESCE(lv."published_text", '') != ''
      )
      AND lv."source_fingerprint" != k."fingerprint"
  )
`

/** ISO instant from the client, or null. Bad input is ignored, not an error. */
function isoBound(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Comma-separated numeric ids from the query, empty when absent. */
function idList(raw: unknown): number[] {
  const parts =
    typeof raw === 'string'
      ? raw.split(',')
      : Array.isArray(raw)
        ? raw.map(String)
        : []
  return parts
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

function flag(raw: unknown) {
  return raw === 'true' || raw === '1'
}

export interface I18nKeyListFilters {
  q: string
  status: I18nKeyStatusFilter
  from: Date | null
  to: Date | null
  pageIds: number[]
  /** Exact keys, ignoring paging. */
  ids: number[]
  release: ReleaseFilter
  namespace: NamespaceFilter
  includeDraftKeys: boolean
}

export function parseI18nKeyListFilters(
  query: Record<string, unknown>
): I18nKeyListFilters {
  return {
    q: typeof query.q === 'string' ? query.q.trim() : '',
    status:
      query.status === I18nKeyStatusFilter.DRAFT ||
      query.status === I18nKeyStatusFilter.PUBLISHED ||
      query.status === I18nKeyStatusFilter.OUTDATED
        ? query.status
        : I18nKeyStatusFilter.ALL,
    from: isoBound(query.from),
    to: isoBound(query.to),
    pageIds: idList(query.pageIds),
    ids: idList(query.ids),
    release: parseReleaseFilter(query),
    namespace: parseNamespaceFilter(query),
    includeDraftKeys: flag(query.includeDraftKeys),
  }
}

async function statusKeyIds(
  projectId: number,
  status: I18nKeyStatusFilter
): Promise<number[] | null> {
  if (status === I18nKeyStatusFilter.ALL) return null
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT k."id" FROM "I18nKey" k WHERE k."project_id" = ? AND (${
      status === I18nKeyStatusFilter.DRAFT
        ? DRAFT_PREDICATE
        : status === I18nKeyStatusFilter.OUTDATED
          ? OUTDATED_PREDICATE
          : `NOT (${DRAFT_PREDICATE})`
    })`,
    projectId
  )
  return rows.map((row) => Number(row.id))
}

/**
 * The `where` for the list, or null when a prefetched id set is already empty
 * and the query can be skipped.
 */
export async function i18nKeyListWhere(
  projectId: number,
  filters: I18nKeyListFilters
): Promise<Prisma.I18nKeyWhereInput | null> {
  const { namespace } = filters
  const [statusIds, namespaceIds] = await Promise.all([
    statusKeyIds(projectId, filters.status),
    namespaceKeyIds(projectId, namespace === 'unnamed' ? null : namespace),
  ])
  if (statusIds?.length === 0 || namespaceIds?.length === 0) return null

  // Unnamed is exactly the placeholder keys; Ungrouped leaves them to it.
  const draftKeys: Prisma.I18nKeyWhereInput[] =
    namespace === 'unnamed'
      ? [UNNAMED_KEYS_WHERE]
      : namespace === 'ungrouped' || !filters.includeDraftKeys
        ? [{ NOT: UNNAMED_KEYS_WHERE }]
        : []

  const { q, from, to, ids, pageIds } = filters
  return {
    projectId,
    ...releaseWhereFragment(filters.release),
    ...(from || to
      ? {
          updatedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    // Several id sets and two independent OR groups, so they nest under AND.
    AND: [
      ...draftKeys,
      ...(statusIds ? [{ id: { in: statusIds } }] : []),
      ...(namespaceIds ? [{ id: { in: namespaceIds } }] : []),
      ...(ids.length ? [{ id: { in: ids } }] : []),
      // Any locale's draft, not just the source language's: searching for a
      // sentence should not depend on which language the project calls original.
      ...(q
        ? [
            {
              OR: [
                { key: { contains: q } },
                { locales: { some: { draftText: { contains: q } } } },
              ],
            },
          ]
        : []),
      ...(pageIds.length
        ? [
            {
              OR: [
                { tags: { some: { pageID: { in: pageIds } } } },
                { tags: { none: {} } },
              ],
            },
          ]
        : []),
    ],
  }
}
