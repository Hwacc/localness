import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '#shared/constants'

const db = vi.hoisted(() => ({
  identities: [] as Array<{
    provider: string
    providerAccountId: string
    userId: number
    displayName: string | null
    email: string | null
  }>,
  users: [] as Array<{
    id: number
    username: string
    email: string | null
    password: string
    role: string
    nickname: string | null
    avatar: string | null
    passwordSetAt: Date | null
  }>,
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => {
  return {
    default: {
      authIdentity: {
        findUnique: async ({
          where,
        }: {
          where: {
            provider_providerAccountId?: {
              provider: string
              providerAccountId: string
            }
            userId_provider?: { userId: number; provider: string }
          }
        }) => {
          if (where.provider_providerAccountId) {
            const { provider, providerAccountId } =
              where.provider_providerAccountId
            const row = db.identities.find(
              (item) =>
                item.provider === provider &&
                item.providerAccountId === providerAccountId
            )
            if (!row) return null
            const user = db.users.find((item) => item.id === row.userId)
            return { ...row, user }
          }
          if (where.userId_provider) {
            return (
              db.identities.find(
                (item) =>
                  item.userId === where.userId_provider!.userId &&
                  item.provider === where.userId_provider!.provider
              ) ?? null
            )
          }
          return null
        },
        create: async ({
          data,
        }: {
          data: (typeof db.identities)[number]
        }) => {
          db.identities.push(data)
          return data
        },
      },
      user: {
        findUnique: async ({
          where,
        }: {
          where: { username?: string; email?: string }
        }) => {
          if (where.username) {
            return db.users.find((item) => item.username === where.username) ?? null
          }
          if (where.email) {
            return db.users.find((item) => item.email === where.email) ?? null
          }
          return null
        },
        create: async ({
          data,
        }: {
          data: Omit<(typeof db.users)[number], 'id'>
        }) => {
          const user = { ...data, id: db.nextId++ }
          db.users.push(user)
          return user
        },
      },
      $transaction: async (
        fn: (client: {
          user: { create: typeof db extends never ? never : unknown }
          authIdentity: { create: unknown }
        }) => Promise<unknown>
      ) => {
        const client = {
          user: {
            create: async ({
              data,
            }: {
              data: Omit<(typeof db.users)[number], 'id'>
            }) => {
              const user = { ...data, id: db.nextId++ }
              db.users.push(user)
              return user
            },
          },
          authIdentity: {
            create: async ({
              data,
            }: {
              data: (typeof db.identities)[number]
            }) => {
              db.identities.push(data)
              return data
            },
          },
        }
        return fn(client as never)
      },
    },
  }
})

vi.mock('bcryptjs', () => ({
  default: {
    hash: async () => 'hashed-random',
  },
}))

const {
  AtlassianAuthError,
  bindAtlassianToUser,
  isEmailDomainAllowed,
  loginOrProvisionAtlassianUser,
  nextUsernameCandidate,
  parseAllowedEmailDomains,
  slugUsername,
  toPublicUser,
} = await import('#server/helper/atlassian-auth')

const domains = ['example.com']

function profile(
  overrides: Partial<{
    account_id: string
    email: string
    name: string
    nickname: string
  }> = {}
) {
  return {
    account_id: 'acc-1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    nickname: 'ada',
    ...overrides,
  }
}

describe('atlassian email allowlist', () => {
  it('parses comma lists and lowercases', () => {
    expect(parseAllowedEmailDomains(' Example.com, Corp.EXAMPLE ')).toEqual([
      'example.com',
      'corp.example',
    ])
  })

  it('rejects missing email, empty allowlist, and other domains', () => {
    expect(isEmailDomainAllowed(undefined, domains)).toBe(false)
    expect(isEmailDomainAllowed('ada@example.com', [])).toBe(false)
    expect(isEmailDomainAllowed('ada@other.test', domains)).toBe(false)
  })

  it('matches email domain case-insensitively', () => {
    expect(isEmailDomainAllowed('Ada@Example.COM', domains)).toBe(true)
  })
})

describe('atlassian usernames', () => {
  it('slugs display names and pads short values', () => {
    expect(slugUsername('Ada Lovelace')).toBe('adalovelace')
    expect(slugUsername('ab')).toBe('userab')
    expect(slugUsername('!!')).toBe('user')
  })

  it('appends a numeric suffix after the first candidate', () => {
    expect(nextUsernameCandidate('ada', 1)).toBe('ada')
    expect(nextUsernameCandidate('ada', 2)).toBe('ada2')
  })
})

describe('atlassian JIT and bind', () => {
  beforeEach(() => {
    db.identities = []
    db.users = []
    db.nextId = 1
  })

  it('provisions a USER with a random password and no passwordSetAt', async () => {
    const user = await loginOrProvisionAtlassianUser(profile(), domains)
    expect(user.username).toBe('ada')
    expect(user.role).toBe(UserRole.USER)
    expect(user.password).toBe('hashed-random')
    expect(user.passwordSetAt).toBeUndefined()
    expect(db.identities).toHaveLength(1)
    expect(db.identities[0].providerAccountId).toBe('acc-1')
  })

  it('logs in by account_id and does not merge a local user with the same email', async () => {
    db.users.push({
      id: 9,
      username: 'local-ada',
      email: 'ada@example.com',
      password: 'local',
      role: UserRole.USER,
      nickname: 'Local',
      avatar: null,
      passwordSetAt: new Date(),
    })
    db.nextId = 10
    const created = await loginOrProvisionAtlassianUser(profile(), domains)
    expect(created.id).not.toBe(9)
    expect(created.username).toBe('ada')
    expect(db.users).toHaveLength(2)
  })

  it('reuses the bound user on later logins', async () => {
    const first = await loginOrProvisionAtlassianUser(profile(), domains)
    const second = await loginOrProvisionAtlassianUser(profile(), domains)
    expect(second.id).toBe(first.id)
    expect(db.users).toHaveLength(1)
  })

  it('increments username when the slug is taken', async () => {
    db.users.push({
      id: 1,
      username: 'ada',
      email: null,
      password: 'x',
      role: UserRole.USER,
      nickname: null,
      avatar: null,
      passwordSetAt: new Date(),
    })
    db.nextId = 2
    const user = await loginOrProvisionAtlassianUser(profile(), domains)
    expect(user.username).toBe('ada2')
  })

  it('binds a free account_id to the current user', async () => {
    db.users.push({
      id: 3,
      username: 'local',
      email: 'local@example.com',
      password: 'x',
      role: UserRole.USER,
      nickname: null,
      avatar: null,
      passwordSetAt: new Date(),
    })
    const identity = await bindAtlassianToUser(3, profile(), domains)
    expect(identity.userId).toBe(3)
  })

  it('rejects bind when the Atlassian account belongs to someone else', async () => {
    await loginOrProvisionAtlassianUser(profile(), domains)
    await expect(bindAtlassianToUser(99, profile(), domains)).rejects.toBeInstanceOf(
      AtlassianAuthError
    )
    await expect(bindAtlassianToUser(99, profile(), domains)).rejects.toMatchObject({
      code: 'identity_taken',
    })
  })

  it('rejects a second Atlassian identity on the same user', async () => {
    db.users.push({
      id: 4,
      username: 'local',
      email: 'local@example.com',
      password: 'x',
      role: UserRole.USER,
      nickname: null,
      avatar: null,
      passwordSetAt: new Date(),
    })
    await bindAtlassianToUser(4, profile(), domains)
    await expect(
      bindAtlassianToUser(4, profile({ account_id: 'acc-2' }), domains)
    ).rejects.toMatchObject({ code: 'already_bound' })
  })

  it('does not expose password or account_id on the public user', () => {
    const publicUser = toPublicUser(
      {
        id: 1,
        username: 'ada',
        password: 'secret',
        passwordSetAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { displayName: 'Ada', email: 'ada@example.com' }
    )
    expect(publicUser).not.toHaveProperty('password')
    expect(publicUser.hasPasswordSet).toBe(false)
    expect(publicUser.atlassian).toEqual({
      connected: true,
      displayName: 'Ada',
      email: 'ada@example.com',
    })
  })
})
