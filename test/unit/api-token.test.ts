import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  tokens: [] as Array<{
    id: number
    projectId: number
    name: string
    tokenHash: string
    prefix: string
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
  assertApiTokenPurgeable,
  assertTokenCoversProject,
  authenticateApiToken,
  authenticateDeliveryRequest,
  bearerToken,
  generateApiToken,
  hashApiToken,
  isApiTokenUsable,
  touchApiToken,
} = await import('#server/helper/api-token')
const { API_TOKEN_TOUCH_INTERVAL_MS } = await import('#shared/constants')

beforeEach(() => {
  db.tokens = []
  db.updates = []
  db.failUpdate = false
  db.nextId = 1
})

function seed(overrides: Partial<{
  projectId: number
  revokedAt: Date | null
}> = {}) {
  const plaintext = generateApiToken()
  const row = {
    id: db.nextId++,
    projectId: overrides.projectId ?? 1,
    name: 'ci',
    tokenHash: hashApiToken(plaintext),
    prefix: apiTokenPrefix(plaintext),
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
  it('resolves the token when it covers the project in the URL', async () => {
    const { plaintext, row } = seed({ projectId: 7 })
    const token = await authenticateDeliveryRequest(`Bearer ${plaintext}`, 7)
    expect(token.id).toBe(row.id)
  })

  it('403s a valid token aimed at another project, rather than 404', async () => {
    // The credential is real; the target simply is not its own.
    const { plaintext } = seed({ projectId: 7 })
    await expect(
      authenticateDeliveryRequest(`Bearer ${plaintext}`, 8)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('401s a header that is missing or is not a bearer', async () => {
    seed()
    await expect(
      authenticateDeliveryRequest(undefined, 1)
    ).rejects.toMatchObject({ statusCode: 401 })
    await expect(
      authenticateDeliveryRequest('Basic bG5zX2FiYw==', 1)
    ).rejects.toMatchObject({ statusCode: 401 })
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

describe('assertTokenCoversProject', () => {
  it('admits the project the token names, comparing ids by value', () => {
    expect(() => assertTokenCoversProject({ projectId: 7 }, 7)).not.toThrow()
    expect(() =>
      assertTokenCoversProject({ projectId: 7 }, Number('7'))
    ).not.toThrow()
  })

  it('403s any other project, so one token never widens into a team', () => {
    expect(thrownStatus(() => assertTokenCoversProject({ projectId: 7 }, 8))).toBe(
      403
    )
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
