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

let ownerCookie: string
let outsiderCookie: string

beforeAll(async () => {
  ownerCookie = await loginCookie(FIXTURES.owner.username, FIXTURES.owner.password)
  outsiderCookie = await loginCookie(FIXTURES.outsider.username, FIXTURES.outsider.password)
})

describe('GET /api/projects/:id/git-sync', () => {
  it('rejects an unauthenticated request', async () => {
    await expect($fetch(`/api/projects/${FIXTURES.projectId}/git-sync`)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('rejects a non-numeric project id', async () => {
    await expect(
      $fetch('/api/projects/not-a-number/git-sync', { headers: { cookie: ownerCookie } })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects a user outside the project team', async () => {
    await expect(
      $fetch(`/api/projects/${FIXTURES.projectId}/git-sync`, { headers: { cookie: outsiderCookie } })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('returns the binding state for a team member without leaking the token', async () => {
    const data = await $fetch(`/api/projects/${FIXTURES.projectId}/git-sync`, {
      headers: { cookie: ownerCookie },
    })
    expect(data).toMatchObject({ role: 'OWNER', configured: false, binding: null, openConflicts: 0 })
    expect(data).not.toHaveProperty('token')
  })
})
