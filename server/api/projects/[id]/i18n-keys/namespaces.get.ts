import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import {
  i18nKeyListWhere,
  parseI18nKeyListFilters,
} from '#server/helper/i18n-key-list'
import { listNamespaces } from '#server/helper/namespace'
import { DRAFT_KEY_PREFIX } from '#shared/utils'
import { countByNamespace, namespaceSuggestions } from '#shared/utils/namespace'
import type { I18nKeyNamespaceCounts } from '#shared/contract'

/**
 * @route GET /api/projects/:id/i18n-keys/namespaces
 * @query the list's filters (q, status, from, to, pageIds, releaseId, unassigned, includeDraftKeys)
 * @description Key counts per namespace under the list's other filters, so a
 * count is what clicking that namespace shows. A namespace filter in the query
 * is ignored — the rail counts every group, not just the selected one.
 * `suggestions` are first segments shared by Ungrouped keys across the whole
 * project, independent of the filters, for an owner to declare in one click.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing project id',
    })
  }
  const projectId = numericID(id)
  await requireTeamMember(event, projectId)

  const filters = {
    ...parseI18nKeyListFilters(getQuery(event)),
    namespace: null,
    ids: [],
  }
  const namespaces = await listNamespaces(projectId)
  const names = namespaces.map((ns) => ns.name)

  const where = await i18nKeyListWhere(projectId, filters)
  const [filtered, all] = await Promise.all([
    where
      ? prisma.i18nKey.findMany({ where, select: { key: true } })
      : Promise.resolve([]),
    prisma.i18nKey.findMany({
      where: { projectId, NOT: { key: { startsWith: DRAFT_KEY_PREFIX } } },
      select: { key: true },
    }),
  ])

  const counts = countByNamespace(
    filtered.map((row) => row.key),
    names
  )
  const result: I18nKeyNamespaceCounts = {
    total: filtered.length,
    ungrouped: counts.ungrouped,
    byId: Object.fromEntries(
      namespaces.map((ns) => [String(ns.id), counts.byName[ns.name] ?? 0])
    ),
    suggestions: namespaceSuggestions(
      all.map((row) => row.key),
      names
    ),
  }
  return result
})
