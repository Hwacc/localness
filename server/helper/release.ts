import prisma from '#server/libs/prisma'
import type { IProjectRelease } from '#shared/types/Project'

/**
 * Release labels: grouping a Project's Pages and I18nKeys by the version they
 * shipped in, so a project with hundreds of entries can be read and exported one
 * version at a time.
 *
 * A label is only ever an association. Deleting one never deletes content, and no
 * text is duplicated per release — a key keeps its one set of `LocaleValue` rows.
 *
 * The rules live here rather than in the route files for the usual reason: the
 * unit-test h3 stub only has `createError`, so anything left in a `.ts` endpoint
 * is untestable by construction.
 */

export class ReleaseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'ReleaseError'
  }
}

export function throwReleaseHttp(error: unknown): never {
  if (error instanceof ReleaseError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

export type ReleaseNameRejection = 'empty' | 'duplicate'

export const RELEASE_NAME_MESSAGES: Record<ReleaseNameRejection, string> = {
  empty: 'A release name is required',
  duplicate: 'A release with this name already exists',
}

/**
 * Why the name is unusable, or null.
 *
 * `takenNames` must exclude the row being renamed, or saving a release under its
 * own name would read as a duplicate. The comparison is case-insensitive because
 * "v1" and "V1" are indistinguishable in a filter dropdown — SQLite's unique
 * index is case-sensitive, so it only catches the exact-collision backstop.
 */
export function releaseNameRejectReason(input: {
  name: string
  takenNames: string[]
}): ReleaseNameRejection | null {
  const name = input.name.trim()
  if (!name) return 'empty'
  const lower = name.toLowerCase()
  if (input.takenNames.some((taken) => taken.trim().toLowerCase() === lower)) {
    return 'duplicate'
  }
  return null
}

export function releaseNameStatus(reason: ReleaseNameRejection): 400 | 409 {
  return reason === 'duplicate' ? 409 : 400
}

/**
 * Requested release ids that do not belong to this Project.
 *
 * A join row only knows two ids, so nothing in the schema stops a page from
 * being attached to another project's release; this is the check that does.
 */
export function foreignReleaseIds(input: {
  releaseIds: number[]
  projectReleaseIds: number[]
}): number[] {
  const allowed = new Set(input.projectReleaseIds)
  return input.releaseIds.filter((releaseId) => !allowed.has(releaseId))
}

export type ReleaseMemberKind = 'page' | 'key'

/** Which release a listing should show. null is "All". */
export type ReleaseFilter = { releaseId: number } | 'unassigned' | null

/**
 * Parse the `releaseId` / `unassigned` query pair into one filter.
 *
 * `releaseId` wins when both are present: they are mutually exclusive, and a
 * stale `unassigned=1` riding along with an explicit id should not silently
 * empty the list.
 */
export function parseReleaseFilter(query: {
  releaseId?: unknown
  unassigned?: unknown
}): ReleaseFilter {
  const raw = query.releaseId
  const releaseId =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (Number.isInteger(releaseId) && releaseId > 0) return { releaseId }
  if (query.unassigned === '1' || query.unassigned === 'true') return 'unassigned'
  return null
}

/**
 * Prisma fragment for one entry's release state. Both `Page` and `I18nKey` name
 * their back-relation `releases`, so the same fragment serves either.
 */
export function releaseWhereFragment(filter: ReleaseFilter) {
  if (filter === null) return {}
  if (filter === 'unassigned') return { releases: { none: {} } }
  return { releases: { some: { releaseId: filter.releaseId } } }
}

/** Creation order. `sort` only breaks ties once something reorders labels. */
const RELEASE_ORDER = [
  { sort: 'asc' as const },
  { id: 'asc' as const },
]

export function shapeRelease(row: {
  id: number
  name: string
  sort: number
  createdAt: Date
  updatedAt: Date
}): IProjectRelease {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listReleases(projectId: number) {
  const rows = await prisma.projectRelease.findMany({
    where: { projectId },
    orderBy: RELEASE_ORDER,
  })
  return rows.map(shapeRelease)
}

async function takenNames(projectId: number, exceptReleaseId?: number) {
  const rows = await prisma.projectRelease.findMany({
    where: {
      projectId,
      ...(exceptReleaseId ? { id: { not: exceptReleaseId } } : {}),
    },
    select: { name: true },
  })
  return rows.map((row) => row.name)
}

async function requireRelease(projectId: number, releaseId: number) {
  const row = await prisma.projectRelease.findFirst({
    where: { id: releaseId, projectId },
  })
  if (!row) throw new ReleaseError(404, 'Release not found')
  return row
}

async function assertNameFree(projectId: number, name: string, exceptId?: number) {
  const reason = releaseNameRejectReason({
    name,
    takenNames: await takenNames(projectId, exceptId),
  })
  if (reason) {
    throw new ReleaseError(releaseNameStatus(reason), RELEASE_NAME_MESSAGES[reason])
  }
  return name.trim()
}

export async function createRelease(params: {
  projectId: number
  name: string
}) {
  const name = await assertNameFree(params.projectId, params.name)
  // New labels sort last, so ordering never changes underneath existing ones.
  const last = await prisma.projectRelease.aggregate({
    where: { projectId: params.projectId },
    _max: { sort: true },
  })
  const row = await prisma.projectRelease.create({
    data: {
      projectId: params.projectId,
      name,
      sort: (last._max.sort ?? 0) + 1,
    },
  })
  return shapeRelease(row)
}

export async function renameRelease(params: {
  projectId: number
  releaseId: number
  name: string
}) {
  await requireRelease(params.projectId, params.releaseId)
  const name = await assertNameFree(
    params.projectId,
    params.name,
    params.releaseId
  )
  const row = await prisma.projectRelease.update({
    where: { id: params.releaseId },
    data: { name },
  })
  return shapeRelease(row)
}

/**
 * Drop the label and its associations.
 *
 * Pages and keys are untouched — they fall back to Unassigned — so this is one
 * delete, never a cascade into content. The join rows go with it through the
 * schema's `onDelete: Cascade`.
 */
export async function deleteRelease(params: {
  projectId: number
  releaseId: number
}) {
  await requireRelease(params.projectId, params.releaseId)
  await prisma.projectRelease.delete({ where: { id: params.releaseId } })
  return { ok: true }
}

/** Distinct ids, order preserved. */
function distinctIds(ids: number[]): number[] {
  return ids.filter((id, index) => ids.indexOf(id) === index)
}

/**
 * Ensure every id names a release in this project, and hand back the distinct
 * list.
 *
 * Exported so a create path can validate *before* it inserts: attaching labels is
 * the last step of creating a page or a translation, and a bad id there should
 * not leave the new row behind.
 */
export async function assertReleaseIdsInProject(params: {
  projectId: number
  releaseIds: number[]
}): Promise<number[]> {
  const releaseIds = distinctIds(params.releaseIds)
  if (!releaseIds.length) return []
  const releases = await prisma.projectRelease.findMany({
    where: { projectId: params.projectId },
    select: { id: true },
  })
  const foreign = foreignReleaseIds({
    releaseIds,
    projectReleaseIds: releases.map((row) => row.id),
  })
  if (foreign.length) {
    throw new ReleaseError(
      400,
      `These releases are not in this project: ${foreign.join(', ')}`
    )
  }
  return releaseIds
}

async function assertEntriesInProject(params: {
  projectId: number
  kind: ReleaseMemberKind
  ids: number[]
}) {
  const ids = distinctIds(params.ids)
  if (!ids.length) return ids
  const rows =
    params.kind === 'page'
      ? await prisma.page.findMany({
          where: { id: { in: ids }, projectID: params.projectId },
          select: { id: true },
        })
      : await prisma.i18nKey.findMany({
          where: { id: { in: ids }, projectId: params.projectId },
          select: { id: true },
        })
  const owned = new Set(rows.map((row) => row.id))
  const foreign = ids.filter((id) => !owned.has(id))
  if (foreign.length) {
    throw new ReleaseError(
      400,
      `These ${params.kind === 'page' ? 'pages' : 'translations'} are not in this project: ${foreign.join(', ')}`
    )
  }
  return ids
}

/**
 * Whether a single entry exists in the project. Separate from
 * `assertEntriesInProject` because one entry that is missing is a 404 — the
 * caller named it directly — while a bulk list with strays is a 400.
 */
async function entryExistsInProject(params: {
  projectId: number
  kind: ReleaseMemberKind
  id: number
}) {
  const row =
    params.kind === 'page'
      ? await prisma.page.findFirst({
          where: { id: params.id, projectID: params.projectId },
          select: { id: true },
        })
      : await prisma.i18nKey.findFirst({
          where: { id: params.id, projectId: params.projectId },
          select: { id: true },
        })
  return Boolean(row)
}

async function existingMemberIds(params: {
  releaseId: number
  kind: ReleaseMemberKind
  ids: number[]
}) {
  const rows =
    params.kind === 'page'
      ? await prisma.pageRelease.findMany({
          where: { releaseId: params.releaseId, pageId: { in: params.ids } },
          select: { pageId: true },
        })
      : await prisma.i18nKeyRelease.findMany({
          where: { releaseId: params.releaseId, i18nKeyId: { in: params.ids } },
          select: { i18nKeyId: true },
        })
  return new Set(
    rows.map((row) => ('pageId' in row ? row.pageId : row.i18nKeyId))
  )
}

async function linkEntries(params: {
  releaseId: number
  kind: ReleaseMemberKind
  ids: number[]
}) {
  if (!params.ids.length) return
  if (params.kind === 'page') {
    await prisma.pageRelease.createMany({
      data: params.ids.map((pageId) => ({ pageId, releaseId: params.releaseId })),
    })
    return
  }
  await prisma.i18nKeyRelease.createMany({
    data: params.ids.map((i18nKeyId) => ({
      i18nKeyId,
      releaseId: params.releaseId,
    })),
  })
}

async function unlinkEntries(params: {
  releaseId: number
  kind: ReleaseMemberKind
  ids: number[]
}) {
  if (!params.ids.length) return
  if (params.kind === 'page') {
    await prisma.pageRelease.deleteMany({
      where: { releaseId: params.releaseId, pageId: { in: params.ids } },
    })
    return
  }
  await prisma.i18nKeyRelease.deleteMany({
    where: { releaseId: params.releaseId, i18nKeyId: { in: params.ids } },
  })
}

/**
 * Add or remove one label across many entries — what the translations page's
 * bulk action needs.
 *
 * Both modes are set operations, so repeating an add is a no-op rather than an
 * error, and removing something that was never attached is silently fine.
 * `skipDuplicates` is unavailable on SQLite, hence filtering to the missing ids
 * first.
 */
export async function setReleaseMembership(params: {
  projectId: number
  releaseId: number
  kind: ReleaseMemberKind
  ids: number[]
  mode: 'add' | 'remove'
}) {
  await requireRelease(params.projectId, params.releaseId)
  const ids = await assertEntriesInProject(params)
  if (!ids.length) return { ok: true, changed: 0 }

  if (params.mode === 'remove') {
    await unlinkEntries({
      releaseId: params.releaseId,
      kind: params.kind,
      ids,
    })
    return { ok: true, changed: ids.length }
  }

  const existing = await existingMemberIds({
    releaseId: params.releaseId,
    kind: params.kind,
    ids,
  })
  const missing = ids.filter((id) => !existing.has(id))
  await linkEntries({ releaseId: params.releaseId, kind: params.kind, ids: missing })
  return { ok: true, changed: missing.length }
}

/**
 * Replace one entry's whole label set — what a Page / translation modal saves.
 * Unknown ids are rejected rather than ignored, so a stale checkbox cannot
 * silently attach a label from another project.
 */
export async function setEntryReleases(params: {
  projectId: number
  kind: ReleaseMemberKind
  id: number
  releaseIds: number[]
}) {
  const entryId = params.id
  if (
    !(await entryExistsInProject({
      projectId: params.projectId,
      kind: params.kind,
      id: entryId,
    }))
  ) {
    throw new ReleaseError(
      404,
      params.kind === 'page' ? 'Page not found' : 'Translation not found'
    )
  }

  const releaseIds = await assertReleaseIdsInProject({
    projectId: params.projectId,
    releaseIds: params.releaseIds,
  })

  await prisma.$transaction(async (tx) => {
    const current =
      params.kind === 'page'
        ? await tx.pageRelease.findMany({
            where: { pageId: entryId },
            select: { releaseId: true },
          })
        : await tx.i18nKeyRelease.findMany({
            where: { i18nKeyId: entryId },
            select: { releaseId: true },
          })
    const kept = new Set(releaseIds)

    for (const row of current) {
      if (kept.has(row.releaseId)) continue
      if (params.kind === 'page') {
        await tx.pageRelease.delete({
          where: {
            pageId_releaseId: { pageId: entryId, releaseId: row.releaseId },
          },
        })
      } else {
        await tx.i18nKeyRelease.delete({
          where: {
            i18nKeyId_releaseId: {
              i18nKeyId: entryId,
              releaseId: row.releaseId,
            },
          },
        })
      }
    }

    const had = new Set(current.map((row) => row.releaseId))
    const added = releaseIds.filter((releaseId) => !had.has(releaseId))
    if (params.kind === 'page') {
      for (const releaseId of added) {
        await tx.pageRelease.create({ data: { pageId: entryId, releaseId } })
      }
      return
    }
    for (const releaseId of added) {
      await tx.i18nKeyRelease.create({ data: { i18nKeyId: entryId, releaseId } })
    }
  })

  return { ok: true, releaseIds }
}