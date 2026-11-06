import prisma from '#server/libs/prisma'
import {
  NAMESPACE_NAME_MESSAGES,
  firstSegment,
  namespaceNameRejectReason,
  namespaceOf,
  type NamespaceNameRejection,
} from '#shared/utils/namespace'
import type { Prisma } from '~~/prisma/client/client'

/**
 * Key namespaces: declared names a project's keys are grouped by. Membership is
 * derived from the key name on every read, so nothing here touches a key.
 */

export class NamespaceError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'NamespaceError'
  }
}

export function throwNamespaceHttp(error: unknown): never {
  if (error instanceof NamespaceError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
    })
  }
  throw error
}

function namespaceNameStatus(reason: NamespaceNameRejection): 400 | 409 {
  return reason === 'duplicate' || reason === 'overlap' ? 409 : 400
}

/** Display order. `id` breaks ties so a fresh project reads in creation order. */
export const NAMESPACE_ORDER = [
  { sort: 'asc' as const },
  { id: 'asc' as const },
]

const NAMESPACE_SELECT = { id: true, name: true, sort: true } as const

export function listNamespaces(projectId: number) {
  return prisma.keyNamespace.findMany({
    where: { projectId },
    select: NAMESPACE_SELECT,
    orderBy: NAMESPACE_ORDER,
  })
}

async function namespaceNames(projectId: number) {
  const rows = await prisma.keyNamespace.findMany({
    where: { projectId },
    select: { name: true },
  })
  return rows.map((row) => row.name)
}

async function takenNames(projectId: number, exceptId?: number) {
  const rows = await prisma.keyNamespace.findMany({
    where: { projectId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  })
  return rows.map((row) => row.name)
}

async function assertNameFree(projectId: number, name: string, exceptId?: number) {
  const reason = namespaceNameRejectReason({
    name,
    takenNames: await takenNames(projectId, exceptId),
  })
  if (reason) {
    throw new NamespaceError(
      namespaceNameStatus(reason),
      NAMESPACE_NAME_MESSAGES[reason]
    )
  }
  return name.trim()
}

async function requireNamespace(projectId: number, namespaceId: number) {
  const row = await prisma.keyNamespace.findFirst({
    where: { id: namespaceId, projectId },
    select: { id: true },
  })
  if (!row) throw new NamespaceError(404, 'Namespace not found')
}

export async function createNamespace(params: { projectId: number; name: string }) {
  const name = await assertNameFree(params.projectId, params.name)
  const last = await prisma.keyNamespace.aggregate({
    where: { projectId: params.projectId },
    _max: { sort: true },
  })
  return prisma.keyNamespace.create({
    data: {
      projectId: params.projectId,
      name,
      sort: (last._max.sort ?? 0) + 1,
    },
    select: NAMESPACE_SELECT,
  })
}

/** Regroups keys by the new name; the keys themselves are never renamed. */
export async function renameNamespace(params: {
  projectId: number
  namespaceId: number
  name: string
}) {
  await requireNamespace(params.projectId, params.namespaceId)
  const name = await assertNameFree(params.projectId, params.name, params.namespaceId)
  return prisma.keyNamespace.update({
    where: { id: params.namespaceId },
    data: { name },
    select: NAMESPACE_SELECT,
  })
}

/** Its keys fall back to Ungrouped. */
export async function deleteNamespace(params: {
  projectId: number
  namespaceId: number
}) {
  await requireNamespace(params.projectId, params.namespaceId)
  await prisma.keyNamespace.delete({ where: { id: params.namespaceId } })
  return { ok: true }
}

/** The full set, in the new order: a partial list would leave the rest's place undefined. */
export async function reorderNamespaces(params: { projectId: number; ids: number[] }) {
  const rows = await prisma.keyNamespace.findMany({
    where: { projectId: params.projectId },
    select: { id: true },
  })
  const current = new Set(rows.map((row) => row.id))
  const given = new Set(params.ids)
  if (
    given.size !== params.ids.length ||
    given.size !== current.size ||
    params.ids.some((id) => !current.has(id))
  ) {
    throw new NamespaceError(
      400,
      'Send every namespace id of this project exactly once'
    )
  }
  await prisma.$transaction(
    params.ids.map((id, index) =>
      prisma.keyNamespace.update({ where: { id }, data: { sort: index + 1 } })
    )
  )
  return listNamespaces(params.projectId)
}

/**
 * The namespace a new project starts with, from the first segment of its key
 * prefix — the same rule the migration seeded existing projects with.
 */
export async function seedNamespaceFromPrefix(
  tx: Prisma.TransactionClient,
  projectId: number,
  keyPrefix: string
) {
  const name = firstSegment(keyPrefix)
  if (namespaceNameRejectReason({ name, takenNames: [] })) return
  await tx.keyNamespace.create({ data: { projectId, name, sort: 1 } })
}

/**
 * Which keys a listing should show. null is "All". `unnamed` is the
 * Translations page's group of `__unnamed_…` placeholders: a key-name prefix, not
 * a namespace, so the list's own where applies it.
 */
export type NamespaceFilter =
  | { namespaceId: number }
  | 'ungrouped'
  | 'unnamed'
  | null

/** `namespaceId` wins when both are present, as `releaseId` does over `unassigned`. */
export function parseNamespaceFilter(query: {
  namespaceId?: unknown
  ungrouped?: unknown
  unnamed?: unknown
}): NamespaceFilter {
  const raw = query.namespaceId
  const namespaceId =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (Number.isInteger(namespaceId) && namespaceId > 0) return { namespaceId }
  if (query.ungrouped === '1' || query.ungrouped === 'true') return 'ungrouped'
  if (query.unnamed === '1' || query.unnamed === 'true') return 'unnamed'
  return null
}

/**
 * Ids of the project's keys in the filter, matched in JS: SQL `LIKE` treats `_`
 * as a wildcard and is case-insensitive on SQLite, both wrong for key names.
 * null means no restriction. An unknown namespace id selects nothing.
 */
export async function namespaceKeyIds(
  projectId: number,
  filter: Exclude<NamespaceFilter, 'unnamed'>
): Promise<number[] | null> {
  if (filter === null) return null
  const names = await namespaceNames(projectId)
  let target: string | null = null
  if (filter !== 'ungrouped') {
    const row = await prisma.keyNamespace.findFirst({
      where: { id: filter.namespaceId, projectId },
      select: { name: true },
    })
    if (!row) return []
    target = row.name
  }
  const keys = await prisma.i18nKey.findMany({
    where: { projectId },
    select: { id: true, key: true },
  })
  return keys
    .filter((row) => namespaceOf(row.key, names) === target)
    .map((row) => row.id)
}
