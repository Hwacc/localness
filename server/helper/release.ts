import prisma from '#server/libs/prisma'
import type { IProjectRelease } from '#shared/types/Project'

/**
 * Release labels: a Project's Pages and I18nKeys grouped by the version they
 * shipped in. Only ever an association — deleting a label never deletes content,
 * and no text is duplicated per release.
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
 * Case-insensitive on purpose: "v1" and "V1" are indistinguishable in the
 * picker, while SQLite's unique index only catches the exact collision.
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

/** A join row only knows two ids, so nothing in the schema stops a cross-project attach. */
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

/** `releaseId` wins when both are present: a stale `unassigned=1` must not silently empty the list. */
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

/** `Page` and `I18nKey` both name their back-relation `releases`, so this serves either. */
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

/** Drops the label and its join rows; content falls back to Unassigned. */
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

/** Exported so a create path can validate before it inserts. */
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

/** One missing entry the caller named directly is a 404; strays in a bulk list are a 400. */
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
 * Set operations, so repeating an add is a no-op. `skipDuplicates` is
 * unavailable on SQLite, hence filtering to the missing ids first.
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

/** Replaces the whole set; a foreign id is rejected, never silently dropped. */
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

/**
 * Labels for the key a tag is bound to. Absent means "leave them alone" — the
 * editor sends them only when the user actually chose something — and an empty
 * array still means "clear them", the same contract `/api/translation/:id` has.
 * Nothing to write while the tag has no key: a label belongs to the key.
 */
export async function setBoundKeyReleases(params: {
  projectId?: number | null
  i18nKeyId?: number | null
  releaseIds?: number[]
}) {
  if (
    !params.projectId ||
    params.releaseIds === undefined ||
    !params.i18nKeyId
  ) {
    return
  }
  try {
    await setEntryReleases({
      projectId: params.projectId,
      kind: 'key',
      id: params.i18nKeyId,
      releaseIds: params.releaseIds,
    })
  } catch (error) {
    throwReleaseHttp(error)
  }
}
