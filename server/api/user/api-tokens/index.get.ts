import prisma from '#server/libs/prisma'
import { requireSessionActor } from '#server/helper/access'

/**
 * @route GET /api/user/api-tokens
 * @description The caller's own tokens, with every project each one was granted.
 *
 * A personal token is only ever visible to the person it belongs to. A project's
 * view of credentials is a different question with a different answer, and lives
 * under the project — see `GET /api/projects/:id/api-tokens`.
 *
 * Each project carries whether it is still `active`, computed from live
 * membership rather than stored. **The list keeps the ones that have gone dead**
 * instead of filtering them out: "this token no longer works" is only actionable
 * if it can say *where*, and a token whose owner has left every team it was
 * granted would otherwise render as a nameless warning.
 *
 * A project deleted outright does disappear — its grant cascades away with it —
 * so an empty list means nothing is left, not that something is hidden.
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionActor(event)

  const [rows, memberships] = await Promise.all([
    prisma.apiToken.findMany({
      where: { createdBy: userId },
      orderBy: { id: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        createdAt: true,
        revokedAt: true,
        lastUsedAt: true,
        projects: {
          select: { project: { select: { id: true, name: true, teamId: true } } },
          orderBy: [{ project: { name: 'asc' } }, { projectId: 'asc' }],
        },
      },
    }),
    prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } }),
  ])

  const teamIds = new Set(memberships.map((row) => row.teamId))

  return rows.map(({ projects, ...row }) => ({
    ...row,
    projects: projects.map((link) => ({
      id: link.project.id,
      name: link.project.name,
      active: teamIds.has(link.project.teamId),
    })),
  }))
})