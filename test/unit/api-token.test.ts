import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  tokens: [] as Array<{
    id: number
    projectId: number
    name: string
    tokenHash: string
    prefix: string
    scope?: string | null
    revokedAt?: Date | null
  }>,
  updates: [] as Array<{ id: number; lastUsedAt: Date }>,
  failUpdate: false,
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    apiToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        db.tokens.find((row) => row.tokenHash === where.tokenHash) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: number }
        data: { lastUsedAt: Date }
      }) => {
        if (db.failUpdate) throw new Error('write failed')
        db.updates.push({ id: where.id, lastUsedAt: data.lastUsedAt })
        return db.tokens.find((row) => row.id === where.id) ?? null
      },
    },
  },
}))

const {
  apiTokenName,
  apiTokenPrefix,
  apiTokenScope,
  assertApiTokenPurgeable,
  assertApiTokenRevocable,
  assertTokenScope,
  authenticateApiToken,
  authenticateDeliveryRequest,
  authenticateWriteRequest,
  bearerToken,
  canRevokeApiToken,
  generateApiToken,
  hashApiToken,
  isApiTokenUsable,
  tokenAllowsScope,
  touchApiToken,
} = await import('#server/helper/api-token')
const { API_TOKEN_TOUCH_INTERVAL_MS, ApiTokenScope } = await import(
  '#shared/constants'
)

beforeEach(() => {
  db.tokens = []
  db.updates = []
  db.failUpdate = false
  db.nextId = 1
})

function seed(overrides: Partial<{
  projectId: number
  scope: string | null
  revokedAt: Date | null
}> = {}) {
  const plaintext = generateApiToken()
  const row = {
    id: db.nextId++,
    projectId: overrides.projectId ?? 1,
    name: 'ci',
    tokenHash: hashApiToken(plaintext),
    prefix: apiTokenPrefix(plaintext),
    // `in` so a test can seed a row that genuinely lacks the column, the way a
    // row predating the migration would look.
    ...('scope' in overrides ? { scope: overrides.scope } : {}),
    revokedAt: overrides.revokedAt ?? null,
  }
  db.tokens.push(row)
  return { plaintext, row }
}

/** The helpers throw h3 `createError` results; the stub shapes them as Error. */
function thrownStatus(fn: () => unknown): number | undefined {
  try {
    fn()
  } catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
  throw new Error('expected the call to throw')
}

describe('generateApiToken', () => {
  it('carries the recognisable prefix', () => {
    expect(generateApiToken().startsWith('lns_')).toBe(true)
  })

  it('is long enough to be unguessable', () => {
    // 32 bytes of CSPRNG output, hex encoded, plus the prefix.
    expect(generateApiToken().length).toBe(4 + 64)
  })

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiToken()))
    expect(seen.size).toBe(50)
  })
})

describe('hashApiToken', () => {
  it('is deterministic, which is what makes the lookup indexed', () => {
    expect(hashApiToken('lns_abc')).toBe(hashApiToken('lns_abc'))
  })

  it('differs for different tokens', () => {
    expect(hashApiToken('lns_abc')).not.toBe(hashApiToken('lns_abd'))
  })

  it('never stores the plaintext', () => {
    const token = generateApiToken()
    expect(hashApiToken(token)).not.toContain(token)
  })
})

describe('apiTokenPrefix', () => {
  it('keeps only the visible head', () => {
    const token = generateApiToken()
    const prefix = apiTokenPrefix(token)
    expect(token.startsWith(prefix)).toBe(true)
    expect(prefix.length).toBeLessThan(token.length)
  })

  it('is not enough to reconstruct the token', () => {
    expect(apiTokenPrefix(generateApiToken()).length).toBe(12)
  })
})

describe('bearerToken', () => {
  it('reads a bearer header', () => {
    expect(bearerToken('Bearer lns_abc')).toBe('lns_abc')
  })

  it('is case-insensitive on the scheme', () => {
    expect(bearerToken('bearer lns_abc')).toBe('lns_abc')
  })

  it('tolerates surrounding whitespace', () => {
    expect(bearerToken('  Bearer   lns_abc  ')).toBe('lns_abc')
  })

  it('rejects a missing header', () => {
    expect(bearerToken(undefined)).toBeNull()
    expect(bearerToken('')).toBeNull()
  })

  it('rejects a non-bearer scheme', () => {
    expect(bearerToken('Basic bG5zX2FiYw==')).toBeNull()
  })
})

describe('isApiTokenUsable', () => {
  it('accepts a live token', () => {
    expect(isApiTokenUsable({})).toBe(true)
    expect(isApiTokenUsable({ revokedAt: null })).toBe(true)
  })

  it('rejects a revoked token', () => {
    expect(isApiTokenUsable({ revokedAt: new Date() })).toBe(false)
  })
})

describe('authenticateApiToken', () => {
  it('resolves a valid token to its row', async () => {
    const { plaintext, row } = seed()
    const found = await authenticateApiToken(plaintext)
    expect(found.id).toBe(row.id)
  })

  it('401s a missing token', async () => {
    await expect(authenticateApiToken(null)).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('401s an unknown token', async () => {
    seed()
    await expect(authenticateApiToken('lns_nope')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('401s a revoked token', async () => {
    const { plaintext } = seed({ revokedAt: new Date() })
    await expect(authenticateApiToken(plaintext)).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('authenticateDeliveryRequest', () => {
  it('resolves the token to a row that carries the project', async () => {
    // The URL names no project, so this row is the only place the endpoint can
    // get one from.
    const { plaintext, row } = seed({ projectId: 7 })
    const token = await authenticateDeliveryRequest(`Bearer ${plaintext}`)
    expect(token.id).toBe(row.id)
    expect(token.projectId).toBe(7)
  })

  it('401s a header that is missing or is not a bearer', async () => {
    seed()
    await expect(authenticateDeliveryRequest(undefined)).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(
      authenticateDeliveryRequest('Basic bG5zX2FiYw==')
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('tokenAllowsScope', () => {
  it('lets a write token do everything', () => {
    expect(tokenAllowsScope({ scope: 'write' }, ApiTokenScope.READ)).toBe(true)
    expect(tokenAllowsScope({ scope: 'write' }, ApiTokenScope.WRITE)).toBe(true)
  })

  it('stops a read token from writing', () => {
    expect(tokenAllowsScope({ scope: 'read' }, ApiTokenScope.READ)).toBe(true)
    expect(tokenAllowsScope({ scope: 'read' }, ApiTokenScope.WRITE)).toBe(false)
  })

  it('treats an absent scope as read, never write', () => {
    // A row that predates the column must fail closed rather than become a
    // credential that can rewrite the dictionary.
    expect(tokenAllowsScope({}, ApiTokenScope.READ)).toBe(true)
    expect(tokenAllowsScope({}, ApiTokenScope.WRITE)).toBe(false)
    expect(tokenAllowsScope({ scope: null }, ApiTokenScope.WRITE)).toBe(false)
  })

  it('treats an unrecognised scope as read', () => {
    expect(tokenAllowsScope({ scope: 'admin' }, ApiTokenScope.WRITE)).toBe(false)
  })
})

describe('assertTokenScope', () => {
  it('passes a write token', () => {
    expect(() =>
      assertTokenScope({ scope: 'write' }, ApiTokenScope.WRITE)
    ).not.toThrow()
  })

  it('403s a read token writing', () => {
    expect(
      thrownStatus(() => assertTokenScope({ scope: 'read' }, ApiTokenScope.WRITE))
    ).toBe(403)
  })
})

describe('authenticateWriteRequest', () => {
  it('resolves a write token to its row', async () => {
    const { plaintext, row } = seed({ scope: 'write', projectId: 7 })
    const token = await authenticateWriteRequest(`Bearer ${plaintext}`)
    expect(token.id).toBe(row.id)
    expect(token.projectId).toBe(7)
  })

  it('403s a read token', async () => {
    const { plaintext } = seed({ scope: 'read' })
    await expect(
      authenticateWriteRequest(`Bearer ${plaintext}`)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('403s a row without a scope, rather than letting it write', async () => {
    const { plaintext } = seed({ scope: null })
    await expect(
      authenticateWriteRequest(`Bearer ${plaintext}`)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('401s before it ever considers scope', async () => {
    seed({ scope: 'write' })
    await expect(authenticateWriteRequest(undefined)).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(authenticateWriteRequest('Bearer lns_nope')).rejects.toMatchObject(
      { statusCode: 401 }
    )
  })
})

describe('apiTokenScope', () => {
  it('defaults to read, so a caller has to ask for write', () => {
    expect(apiTokenScope(undefined)).toBe(ApiTokenScope.READ)
    expect(apiTokenScope(null)).toBe(ApiTokenScope.READ)
    expect(apiTokenScope('')).toBe(ApiTokenScope.READ)
  })

  it('accepts the two real scopes', () => {
    expect(apiTokenScope('read')).toBe(ApiTokenScope.READ)
    expect(apiTokenScope('write')).toBe(ApiTokenScope.WRITE)
  })

  it('400s anything else instead of silently downgrading', () => {
    expect(thrownStatus(() => apiTokenScope('admin'))).toBe(400)
    expect(thrownStatus(() => apiTokenScope(1))).toBe(400)
  })
})

describe('touchApiToken', () => {
  const now = Date.now()

  it('stamps a token that has never been used', async () => {
    await touchApiToken({ id: 1, lastUsedAt: null })
    expect(db.updates.map((row) => row.id)).toEqual([1])
  })

  it('skips the write while the stamp is still fresh', async () => {
    // A write per request would put every read behind SQLite's single writer.
    await touchApiToken({ id: 1, lastUsedAt: new Date(now - 1000) })
    expect(db.updates).toEqual([])
  })

  it('refreshes once the stamp is older than the interval', async () => {
    await touchApiToken({
      id: 1,
      lastUsedAt: new Date(now - API_TOKEN_TOUCH_INTERVAL_MS - 1000),
    })
    expect(db.updates.map((row) => row.id)).toEqual([1])
  })

  it('swallows a failed write, because the read must not fail on bookkeeping', async () => {
    db.failUpdate = true
    await expect(
      touchApiToken({ id: 1, lastUsedAt: null })
    ).resolves.toBeUndefined()
  })
})

describe('canRevokeApiToken', () => {
  const member = (userId: number, isSteward = false) => ({ userId, isSteward })

  it('lets a member stop the credential they minted', () => {
    expect(canRevokeApiToken({ createdBy: 3 }, member(3))).toBe(true)
  })

  it('compares ids by value, not by type', () => {
    expect(canRevokeApiToken({ createdBy: 3 }, member(Number('3')))).toBe(true)
  })

  it('refuses a token someone else minted', () => {
    expect(canRevokeApiToken({ createdBy: 3 }, member(4))).toBe(false)
  })

  it('lets a steward stop any token on the project', () => {
    expect(canRevokeApiToken({ createdBy: 3 }, member(4, true))).toBe(true)
  })
})

describe('assertApiTokenRevocable', () => {
  it('passes a member acting on their own token', () => {
    expect(() =>
      assertApiTokenRevocable(
        { createdBy: 3 },
        { userId: 3, isSteward: false }
      )
    ).not.toThrow()
  })

  it('403s a member reaching for another member token', () => {
    expect(
      thrownStatus(() =>
        assertApiTokenRevocable(
          { createdBy: 3 },
          { userId: 4, isSteward: false }
        )
      )
    ).toBe(403)
  })
})

describe('apiTokenName', () => {
  it('trims a usable name', () => {
    expect(apiTokenName('  CI pipeline  ')).toBe('CI pipeline')
  })

  it('rejects an empty or missing name as a 400', () => {
    expect(thrownStatus(() => apiTokenName('   '))).toBe(400)
    expect(thrownStatus(() => apiTokenName(undefined))).toBe(400)
  })

  it('rejects an over-long name, and accepts one at the limit', () => {
    expect(thrownStatus(() => apiTokenName('x'.repeat(61)))).toBe(400)
    expect(apiTokenName('x'.repeat(60)).length).toBe(60)
  })
})

describe('assertApiTokenPurgeable', () => {
  it('allows deleting a revoked token', () => {
    expect(() =>
      assertApiTokenPurgeable({ revokedAt: new Date() })
    ).not.toThrow()
  })

  it('409s a live token, so delete can never stand in for revoke', () => {
    // Deleting a live token would drop the consumer with nothing recorded;
    // revoking first is what leaves the trail explaining the outage.
    expect(thrownStatus(() => assertApiTokenPurgeable({ revokedAt: null }))).toBe(
      409
    )
    expect(thrownStatus(() => assertApiTokenPurgeable({}))).toBe(409)
  })
})
