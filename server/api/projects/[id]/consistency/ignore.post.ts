import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { requirePlus } from '#server/helper/license'
import { readZodBody } from '#server/helper/validate'
import { snapshotFindingKeyIds } from '#server/helper/consistency'
import { zConsistencyIgnore } from '#shared/utils/schemas'

/**
 * @route POST /api/projects/:id/consistency/ignore
 * @description Whitelist a finding: `ignored: true` records the member
 * snapshot (the report resurfaces the group when a NEW key joins it — R2),
 * `ignored: false` restores. The members come from the latest scan snapshot,
 * never from the client: a forged superset would silently swallow duplicates
 * that do not exist yet. No rescan — ignoring is a whitelist edit, mirrored
 * onto the snapshot row's `ignored` so the report pages without it. Deliberately opaque-id keyed with no key FK, so
 * deleting or renaming keys never has to maintain this table.
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

  const body = await readZodBody(event, zConsistencyIgnore.parse)

  const finding = { projectId: nID, ruleId: body.ruleId, groupId: body.groupId }
  if (!body.ignored) {
    await prisma.$transaction([
      prisma.consistencyIgnore.deleteMany({ where: finding }),
      prisma.consistencySnapshotFinding.updateMany({
        where: finding,
        data: { ignored: false },
      }),
    ])
    return { ignored: false }
  }

  const keyIds = await snapshotFindingKeyIds(nID, body.ruleId, body.groupId)
  if (!keyIds) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Finding no longer present — refresh the report',
    })
  }

  await prisma.$transaction([
    prisma.consistencyIgnore.upsert({
      where: { projectId_ruleId_groupId: finding },
      create: { ...finding, keyIds },
      update: { keyIds },
    }),
    // The members were just recorded from this row, so it is covered.
    prisma.consistencySnapshotFinding.updateMany({
      where: finding,
      data: { ignored: true },
    }),
  ])
  return { ignored: true }
})
