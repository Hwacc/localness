import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { FIXTURES } from './fixtures'

await setup({
  rootDir: fileURLToPath(new URL('../../', import.meta.url)),
  dev: true,
  server: true,
  setupTimeout: 240_000,
  env: { DATABASE_URL: process.env.DATABASE_URL! },
})

async function loginCookie(username: string, password: string) {
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('login did not set a session cookie')
  return cookie.split(';')[0]
}

function get(url: string, cookie: string) {
  return $fetch(url, { headers: { cookie } })
}

let ownerCookie: string
let adminCookie: string

beforeAll(async () => {
  ownerCookie = await loginCookie(FIXTURES.owner.username, FIXTURES.owner.password)
  adminCookie = await loginCookie(FIXTURES.admin.username, FIXTURES.admin.password)
})

describe('visibility is scoped to team membership', () => {
  it('shows the team and its project to a member', async () => {
    const teams = (await get('/api/teams', ownerCookie)) as { id: number }[]
    expect(teams.map((team) => team.id)).toContain(FIXTURES.teamId)

    const projects = (await get('/api/project', ownerCookie)) as { id: number }[]
    expect(projects.map((project) => project.id)).toContain(FIXTURES.projectId)
  })

  // The rule this suite exists for: `User.role = ADMIN` widens nothing on its
  // own. See vault `权限层级`.
  it('hides both from an Admin who is not on the team', async () => {
    expect(await get('/api/teams', adminCookie)).toEqual([])
    expect(await get('/api/project', adminCookie)).toEqual([])
  })

  it('refuses team detail, project detail and the owner roster to that Admin', async () => {
    await expect(get(`/api/teams/${FIXTURES.teamId}`, adminCookie)).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(get(`/api/project/${FIXTURES.projectId}`, adminCookie)).rejects.toMatchObject({
      statusCode: 403,
    })
    await expect(
      get(`/api/projects/${FIXTURES.projectId}/owners`, adminCookie)
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('an Admin who joined the team like anyone else', () => {
  let adminUserId: number

  beforeAll(async () => {
    const invite = (await $fetch(`/api/teams/${FIXTURES.teamId}/invite-codes`, {
      method: 'POST',
      headers: { cookie: ownerCookie },
      body: {},
    })) as { code: string }

    await $fetch('/api/teams/join', {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: { code: invite.code },
    })

    const me = (await get('/api/user', adminCookie)) as { id: number }
    adminUserId = me.id
  })

  it('sees the team and its project', async () => {
    const teams = (await get('/api/teams', adminCookie)) as { id: number }[]
    expect(teams.map((team) => team.id)).toEqual([FIXTURES.teamId])

    const projects = (await get('/api/project', adminCookie)) as { id: number }[]
    expect(projects.map((project) => project.id)).toEqual([FIXTURES.projectId])
  })

  // Joining is not a promotion: team-level authority is the OWNER role, which an
  // Admin gets only if the invite code carried it.
  it('still cannot manage the team as a plain MEMBER', async () => {
    await expect(
      $fetch(`/api/teams/${FIXTURES.teamId}/members/${adminUserId}`, {
        method: 'PATCH',
        headers: { cookie: adminCookie },
        body: { role: 'OWNER' },
      })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  // The one Admin privilege that survived joining: roster edits on a team they
  // are on, without holding a ProjectOwner row.
  it('may edit the owner roster without being a Project Owner', async () => {
    const before = (await get(
      `/api/projects/${FIXTURES.projectId}/owners`,
      adminCookie
    )) as { canAppoint: boolean }
    expect(before.canAppoint).toBe(true)

    await $fetch(`/api/projects/${FIXTURES.projectId}/owners`, {
      method: 'POST',
      headers: { cookie: adminCookie },
      body: { userId: adminUserId },
    })

    const after = (await get(
      `/api/projects/${FIXTURES.projectId}/owners`,
      adminCookie
    )) as { owners: { userId: number }[] }
    expect(after.owners.map((owner) => owner.userId)).toEqual([adminUserId])
  })
})
