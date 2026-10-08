import { beforeEach, describe, expect, it, vi } from 'vitest'

type ProjectRow = { id: number; name: string; teamId: number }
type MemberRow = { userId: number; teamId: number }
type LinkRow = { tokenId: number; projectId: number }
type PageRow = { id: number; projectID: number | null }

const db = vi.hoisted(() => ({
  projects: [] as ProjectRow[],
  members: [] as MemberRow[],
  links: [] as LinkRow[],
  pages: [] as PageRow[],
}))

vi.mock('#server/libs/prisma', () => {
  /** The membership predicate, in one place so both shapes agree. */
  const isMember = (teamId: number, userId: number) =>
    db.members.some((row) => row.teamId === teamId && row.userId === userId)

  const reachable = (link: LinkRow, teamMembers?: { some: { userId: number } }) => {
    if (teamMembers && !db.projects.some((p) => p.id === link.projectId && isMember(p.teamId, teamMembers.some.userId)))
      return false
    return true
  }

  /** Enough of Prisma's `orderBy` to prove a sort was actually asked for. */
  function applyOrder<T extends { projectId: number }>(rows: T[], orderBy: unknown): T[] {
    const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []
    if (!orders.length) return rows
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [field, direction] = Object.entries(order as Record<string, unknown>)[0]!
        const pick = (row: T) =>
          field === 'projectId'
            ? row.projectId
            : (db.projects.find((p) => p.id === row.projectId) as any)?.[
                Object.keys((order as any)[field])[0]
              ]
        const left = pick(a)
        const right = pick(b)
        if (left === right) continue
        const delta = left < right ? -1 : 1
        return direction === 'desc' ? -delta : delta
      }
      return 0
    })
  }

  return {
    default: {
      apiTokenProject: {
        findMany: async ({ where, orderBy }: any) => {
          const name: string | undefined = where.project?.name
          const teamMembers = where.project?.team?.members
          const links = db.links
            .filter((link) => link.tokenId === where.tokenId)
            .filter((link) => {
              if (name === undefined) return true
              const project = db.projects.find((p) => p.id === link.projectId)
              return project?.name === name
            })
            .filter((link) => reachable(link, teamMembers))

          return applyOrder(links, orderBy).map((link) => ({
            projectId: link.projectId,
            project: db.projects.find((p) => p.id === link.projectId),
          }))
        },
        findUnique: async ({ where }: any) => {
          const key = where.tokenId_projectId
          const link = db.links.find(
            (row) => row.tokenId === key.tokenId && row.projectId === key.projectId
          )
          return link ? { projectId: link.projectId } : null
        },
      },
      project: {
        findFirst: async ({ where }: any) => {
          const userId = where.team?.members?.some?.userId
          const found = db.projects.find(
            (p) => p.id === where.id && (userId === undefined || isMember(p.teamId, userId))
          )
          return found ? { id: found.id } : null
        },
      },
      page: {
        findUnique: async ({ where }: any) => {
          const page = db.pages.find((row) => row.id === where.id)
          return page ? { projectID: page.projectID } : null
        },
      },
    },
  }
})

const {
  apiTokenProjectIds,
  authorizeTokenProject,
  isUserOnProjectTeam,
  listTokenProjects,
  resolveProjectParam,
  resolveTokenProject,
  requireTokenPageAccess,
} = await import('#server/helper/api-token-project')

beforeEach(() => {
  db.projects = []
  db.members = []
  db.links = []
  db.pages = []
})

/** A project on a team, with `memberIds` on that team. */
function seedProject(id: number, name: string, teamId: number, memberIds: number[] = []) {
  db.projects.push({ id, name, teamId })
  for (const userId of memberIds) db.members.push({ userId, teamId })
  return id
}

function grant(tokenId: number, projectIds: number[]) {
  for (const projectId of projectIds) db.links.push({ tokenId, projectId })
}

const OWNER = 3
const STRANGER = 4

describe('isUserOnProjectTeam', () => {
  it('is true for a member of the project team', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    await expect(isUserOnProjectTeam(OWNER, 10)).resolves.toBe(true)
  })

  it('is false for a platform admin who is not on the team', async () => {
    // `requireTeamMember` hard-codes isAdmin:false and this mirrors it — being an
    // Admin is a fact about the actor, not a way into a project.
    seedProject(10, 'Web', 1, [])
    await expect(isUserOnProjectTeam(OWNER, 10)).resolves.toBe(false)
  })

  it('is false for a project that does not exist', async () => {
    await expect(isUserOnProjectTeam(OWNER, 999)).resolves.toBe(false)
  })
})

describe('apiTokenProjectIds', () => {
  it('accepts a non-empty list and deduplicates it', () => {
    expect(apiTokenProjectIds([10, 10, 11])).toEqual([10, 11])
  })

  it('refuses anything that is not a list of positive integers', () => {
    for (const raw of [undefined, null, [], 'x', [0], [-1], [1.5], [1, 'x']]) {
      expect(() => apiTokenProjectIds(raw)).toThrow()
    }
  })
})

describe('listTokenProjects', () => {
  it('lists the granted projects the owner can still reach', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Admin', 2, [OWNER])
    grant(1, [10, 11])

    const projects = await listTokenProjects({ id: 1, createdBy: OWNER })
    expect(projects.map((p) => p.id).sort()).toEqual([10, 11])
  })

  it('omits a project whose team the owner has left', async () => {
    // Not addressable, so listing it would be a promise the next request breaks.
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(20, 'Theirs', 2, [])
    grant(1, [10, 20])

    const projects = await listTokenProjects({ id: 1, createdBy: OWNER })
    expect(projects.map((p) => p.id)).toEqual([10])
  })

  it('is empty — not an error — once the owner has left everything', async () => {
    seedProject(20, 'Theirs', 2, [])
    grant(1, [20])
    expect(await listTokenProjects({ id: 1, createdBy: OWNER })).toEqual([])
  })

  it('orders by name so the list is stable between calls', async () => {
    seedProject(10, 'Zebra', 1, [OWNER])
    seedProject(11, 'Apple', 1, [OWNER])
    grant(1, [10, 11])
    const projects = await listTokenProjects({ id: 1, createdBy: OWNER })
    expect(projects.map((p) => p.name)).toEqual(['Apple', 'Zebra'])
  })
})

describe('resolveProjectParam', () => {
  it('reads a bare number as an id', async () => {
    grant(1, [10])
    await expect(resolveProjectParam(1, '10')).resolves.toBe(10)
  })

  it('resolves a unique name within the token set', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    grant(1, [10])
    await expect(resolveProjectParam(1, 'Web')).resolves.toBe(10)
  })

  it('404s an unknown name', async () => {
    grant(1, [10])
    await expect(resolveProjectParam(1, 'Nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('does not resolve a name outside the token set', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Secret', 1, [OWNER])
    grant(1, [10])
    await expect(resolveProjectParam(1, 'Secret')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('409s an ambiguous name rather than guessing', async () => {
    // `Project.name` has no unique constraint and a set can span teams, so two
    // of a token's projects really can share a name. Picking one would write to
    // whichever row the database returned first.
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Web', 2, [OWNER])
    grant(1, [10, 11])
    await expect(resolveProjectParam(1, 'Web')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('400s a missing value', async () => {
    await expect(resolveProjectParam(1, '')).rejects.toMatchObject({ statusCode: 400 })
    await expect(resolveProjectParam(1, undefined)).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe('authorizeTokenProject', () => {
  it('passes a granted project the owner is still on', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    grant(1, [10])
    await expect(authorizeTokenProject({ id: 1, createdBy: OWNER }, 10)).resolves.toBe(10)
  })

  it('404s a project that was never granted', async () => {
    // 404, not 403: a project this credential was never given must be
    // indistinguishable from one that does not exist.
    seedProject(10, 'Web', 1, [OWNER])
    await expect(
      authorizeTokenProject({ id: 1, createdBy: OWNER }, 10)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('403s a granted project the owner has left', async () => {
    // The point of the whole model. Nothing to hide: the project was granted to
    // them once, so it exists and they know it.
    seedProject(20, 'Theirs', 2, [])
    grant(1, [20])
    await expect(
      authorizeTokenProject({ id: 1, createdBy: OWNER }, 20)
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('resolveTokenProject', () => {
  it('needs no parameter for a single-project token', async () => {
    // Every token that existed before this model looks like this, so the whole
    // point is that it behaves exactly as it did.
    seedProject(10, 'Web', 1, [OWNER])
    grant(1, [10])
    await expect(resolveTokenProject({ id: 1, createdBy: OWNER }, undefined)).resolves.toBe(10)
  })

  it('400s a multi-project token that names none', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Admin', 1, [OWNER])
    grant(1, [10, 11])
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, undefined)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('403s a token whose set is empty', async () => {
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, undefined)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('still requires the parameter when only one of several is reachable', async () => {
    // The set is what decides, not what survives the membership filter: the
    // credential was granted two projects, so it cannot silently pick one.
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(20, 'Theirs', 2, [])
    grant(1, [10, 20])
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, undefined)
    ).rejects.toMatchObject({ statusCode: 400 })
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, '10')
    ).resolves.toBe(10)
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, '20')
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('resolves a name through to authorization', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Admin', 1, [OWNER])
    grant(1, [10, 11])
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, 'Admin')
    ).resolves.toBe(11)
  })

  it('404s an id that is not in the set', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(99, 'Other', 1, [OWNER])
    grant(1, [10])
    await expect(
      resolveTokenProject({ id: 1, createdBy: OWNER }, '99')
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('requireTokenPageAccess', () => {
  it('derives the project from the page', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    grant(1, [10])
    db.pages.push({ id: 100, projectID: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).resolves.toEqual({ projectId: 10 })
  })

  it('404s a page that does not exist', async () => {
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s a page whose project is outside the set', async () => {
    // Same answer as a missing page: the caller has no business learning which
    // of the two it is.
    seedProject(20, 'Theirs', 2, [OWNER])
    grant(1, [10])
    db.pages.push({ id: 100, projectID: 20 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s a page with no project at all', async () => {
    db.pages.push({ id: 100, projectID: null })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('403s a granted page whose owner has left the team', async () => {
    seedProject(20, 'Theirs', 2, [])
    grant(1, [20])
    db.pages.push({ id: 100, projectID: 20 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('accepts a ?project= that agrees with the page', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Admin', 1, [OWNER])
    grant(1, [10, 11])
    db.pages.push({ id: 100, projectID: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100, '10')
    ).resolves.toEqual({ projectId: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100, 'Web')
    ).resolves.toEqual({ projectId: 10 })
  })

  it('400s a ?project= naming a different project than the page', async () => {
    // The one place a caller could otherwise say one project and be acted on
    // under another. Ignoring the parameter would be exactly the silent
    // disagreement this API spends 400/404/409 answers preventing elsewhere.
    seedProject(10, 'Web', 1, [OWNER])
    seedProject(11, 'Admin', 1, [OWNER])
    grant(1, [10, 11])
    db.pages.push({ id: 100, projectID: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100, '11')
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('treats an empty ?project= as absent, not as a mismatch', async () => {
    seedProject(10, 'Web', 1, [OWNER])
    grant(1, [10])
    db.pages.push({ id: 100, projectID: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100, '')
    ).resolves.toEqual({ projectId: 10 })
  })

  it('ignores who else is on the team', async () => {
    seedProject(10, 'Web', 1, [STRANGER])
    grant(1, [10])
    db.pages.push({ id: 100, projectID: 10 })
    await expect(
      requireTokenPageAccess({ id: 1, createdBy: OWNER }, 100)
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})