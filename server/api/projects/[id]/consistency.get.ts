import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { consistencyScans, currentScanVersion } from '#server/helper/consistency'
import { readReportSummary } from '#server/helper/consistency-report'
import { zConsistencyReportQuery } from '#shared/utils/schemas'

/**
 * @route GET /api/projects/:id/consistency
 * @description The report head, read from the project's latest scan snapshot
 * — it never scans on request. Unfiltered severity counts and filter facets,
 * then per category (under the filter) its total and first page; more rows
 * come from …/consistency/findings, whitelisted ones from …/consistency/ignored.
 * `report` is null before the first scan; `outdated` says keys, translations,
 * tags or settings changed since, and `scan` is the background scan's state.
 * Starting a scan is the client's call (POST …/consistency/scan).
 * @access Private (team member, Plus license)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  requirePlus()

  const query = await getValidatedQuery(event, zConsistencyReportQuery.parse)
  const [summary, version] = await Promise.all([
    readReportSummary(
      nID,
      {
        severities: query.severities,
        locales: query.locales,
        ruleIds: query.ruleIds,
        query: query.q,
      },
      Object.fromEntries(query.limits)
    ),
    currentScanVersion(nID),
  ])
  const scan = consistencyScans.status(nID)
  if (!summary) return { report: null, outdated: true, scan }
  const { version: scannedVersion, ...report } = summary
  return { report, outdated: scannedVersion !== version, scan }
})
