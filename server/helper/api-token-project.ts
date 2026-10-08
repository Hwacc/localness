import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import type { DeliveryProjectRef } from '#shared/types/Delivery'

/**
 * Which project a token-addressed request is about, and whether it is allowed.
 *
 * Two independent conditions, and they fail with different codes on purpose:
 *
 * - **The project must be in the token's set.** Absent is a 404, not a 403: a
 *   project the credential was never granted must not be distinguishable from
 *   one that does not exist.
 * - **The owner must still be on that project's team.** This is the point of the
 *   whole model — the authority is the person's live membership, so the
 *   credential stops working the day they leave. It is a 403 because there is
 *   nothing to hide: the caller already knows the project exists, it was granted
 *   to them once.
 *
 * `createError` is imported from `h3` rather than left to Nitro's auto-import so
 * the `test/stubs/h3.ts` alias can stand in for it and these rules stay unit
 * tested.
 *
 * Session-free throughout: `server/helper/access.ts` cannot be reused here,
 * because every gate there starts from `requireUserSession`.
 */

/** The three fields every rule below needs; narrower than the token row. */
export interface TokenIdentity {
  id: number
  createdBy: number
}

/**
 * One query, project-rooted: the platform ADMIN does not bypass team membership,
 * matching the `isAdmin: false` in `requireTeamMember`.
 */
export async function isUserOnProjectTeam(
  userId: number,
  projectId: number
): Promise<boolean> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, team: { members: { some: { userId } } } },
    select: { id: true },
  })
  return row !== null
}

/** The set as granted, regardless of whether its owner can still reach it. */
export async function tokenProjectIds(tokenId: number): Promise<number[]> {
  const rows = await prisma.apiTokenProject.findMany({
    where: { tokenId },
    select: { projectId: true },
    orderBy: { projectId: 'asc' },
  })
  return rows.map((row) => row.projectId)
}

async function isProjectInTokenSet(
  tokenId: number,
  projectId: number
): Promise<boolean> {
  const row = await prisma.apiTokenProject.findUnique({
    where: { tokenId_projectId: { tokenId, projectId } },
    select: { projectId: true },
  })
  return row !== null
}

/**
 * What this token can address *right now*: the set, filtered by live membership.
 * A project whose team the owner has left is not addressable, so listing it
 * would be a promise the next request would break.
 *
 * Filtered inside the query rather than by a second round trip: unlike the
 * authorization path, nothing here needs to tell "not granted" apart from
 * "no longer a member".
 */
export async function listTokenProjects(
  token: TokenIdentity
): Promise<DeliveryProjectRef[]> {
  const rows = await prisma.apiTokenProject.findMany({
    where: {
      tokenId: token.id,
      project: { team: { members: { some: { userId: token.createdBy } } } },
    },
    select: { project: { select: { id: true, name: true } } },
    orderBy: [{ project: { name: 'asc' } }, { projectId: 'asc' }],
  })
  return rows.map((row) => row.project)
}

/**
 * `?project=` accepts an id or a name, mirroring `resolveReleaseParam` for
 * `?release=`. A bare number is taken as an id and checked for set membership
 * afterwards, so a wrong id and a wrong name both land as "not found" rather
 * than as two different errors.
 *
 * **A name must be unambiguous.** `Project.name` has no unique constraint, and a
 * token's set can span teams, so two of its projects can share a name. Guessing
 * would write to whichever row the database happened to return first.
 */
export async function resolveProjectParam(
  tokenId: number,
  raw: unknown
): Promise<number> {
  const value = raw == null ? '' : String(raw).trim()
  if (!value) {
    throw createError({ statusCode: 400, statusMessage: 'Missing project' })
  }
  if (/^\d+$/.test(value)) return Number(value)

  const rows = await prisma.apiTokenProject.findMany({
    where: { tokenId, project: { name: value } },
    select: { projectId: true },
  })
  if (rows.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `Unknown project: ${value}`,
    })
  }
  if (rows.length > 1) {
    throw createError({
      statusCode: 409,
      statusMessage: `Project name "${value}" is ambiguous for this token; use the project id instead`,
    })
  }
  return rows[0]!.projectId
}

/**
 * The `projects` field of a token-creation body: at least one, deduplicated.
 *
 * A token with no projects authenticates and can do nothing, which is a
 * confusing thing to hand someone, so it is refused at creation instead. Empty
 * sets only ever appear later, when a project is deleted out from under one.
 */
export function apiTokenProjectIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pick at least one project for this token',
    })
  }
  const ids = raw.filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0
  )
  if (ids.length === 0 || ids.length !== raw.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Pick at least one project for this token',
    })
  }
  return [...new Set(ids)]
}

export async function authorizeTokenProject(
  token: TokenIdentity,
  projectId: number
): Promise<number> {
  if (!(await isProjectInTokenSet(token.id, projectId))) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  if (!(await isUserOnProjectTeam(token.createdBy, projectId))) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "This token's owner is no longer a member of this project's team",
    })
  }
  return projectId
}

/**
 * The single entry every project-addressed request goes through.
 *
 * The parameter is optional exactly when the set holds one project, which is
 * what keeps a single-project token — every token that existed before this
 * model — behaving byte-for-byte as it did, URL still naming no project.
 */
export async function resolveTokenProject(
  token: TokenIdentity,
  raw: unknown
): Promise<number> {
  const granted = await tokenProjectIds(token.id)

  if (granted.length === 0) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This token is not attached to any project',
    })
  }
  if (raw == null || String(raw).trim() === '') {
    if (granted.length > 1) {
      throw createError({
        statusCode: 400,
        statusMessage: `This token addresses several projects; pass ?project=<id-or-name> (see GET /api/v1/projects)`,
      })
    }
    return authorizeTokenProject(token, granted[0]!)
  }
  return authorizeTokenProject(token, await resolveProjectParam(token.id, raw))
}

/**
 * The write routes addressed by `pageId` never *need* a project, so it comes
 * from the page. A page outside the token's set is reported as missing rather
 * than forbidden, which is the rule `assertPageInProject` already followed.
 *
 * `rawProject` is the `?project=` a caller may have sent anyway, and it is
 * checked rather than ignored. Ignoring it would be the one place in this API
 * where a request can name one project and quietly act on another — everywhere
 * else that is exactly what the 400/404/409 answers exist to prevent. The
 * parameter is still optional: it is a contradiction to catch, not an input to
 * require.
 */
export async function requireTokenPageAccess(
  token: TokenIdentity,
  pageId: number,
  rawProject?: unknown
): Promise<{ projectId: number }> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { projectID: true },
  })
  if (!page?.projectID) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
  if (!(await isProjectInTokenSet(token.id, page.projectID))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
  if (rawProject != null && String(rawProject).trim() !== '') {
    const named = await resolveProjectParam(token.id, rawProject)
    if (named !== page.projectID) {
      throw createError({
        statusCode: 400,
        statusMessage: `?project= names a different project than page ${pageId} belongs to; drop the parameter`,
      })
    }
  }
  if (!(await isUserOnProjectTeam(token.createdBy, page.projectID))) {
    throw createError({
      statusCode: 403,
      statusMessage:
        "This token's owner is no longer a member of this project's team",
    })
  }
  return { projectId: page.projectID }
}