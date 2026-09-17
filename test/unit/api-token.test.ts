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
  nextId: 1,
}))

vi.mock('#server/libs/prisma', () => ({
  default: {
    apiToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        db.tokens.find((row) => row.tokenHash === where.tokenHash) ?? null,
    },
  },
}))

const {
  ApiTokenError,
  apiTokenName,
  apiTokenPrefix,
  assertApiTokenPurgeable,
  assertTokenCoversProject,
  authenticateApiToken,
  bearerToken,
  generateApiToken,
  hashApiToken,
  isApiTokenUsable,
} = await import('#server/helper/api-token')

beforeEach(() => {
  db.tokens = []
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
    await expect(authenticateApiToken('lns_nope')).rejects.toBeInstanceOf(
      ApiTokenError
    )
  })

  it('401s a revoked token', async () => {
    const { plaintext } = seed({ revokedAt: new Date() })
    await expect(authenticateApiToken(plaintext)).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('assertTokenCoversProject', () => {
  it('admits the project the token names', () => {
    expect(() =>
      assertTokenCoversProject({ projectId: 7 }, 7)
    ).not.toThrow()
  })

  it('compares ids by value, not by type', () => {
    expect(() =>
      assertTokenCoversProject({ projectId: 7 }, Number('7'))
    ).not.toThrow()
  })

  it('403s any other project, so one token never widens into a team', () => {
    expect(() => assertTokenCoversProject({ projectId: 7 }, 8)).toThrow(
      ApiTokenError
    )
  })

  it('reports 403 rather than 404: the credential is valid, the target is not', () => {
    try {
      assertTokenCoversProject({ projectId: 7 }, 8)
    } catch (error) {
      expect((error as ApiTokenError).statusCode).toBe(403)
    }
  })
})

describe('apiTokenName', () => {
  it('trims a usable name', () => {
    expect(apiTokenName('  CI pipeline  ')).toBe('CI pipeline')
  })

  it('rejects an empty name', () => {
    expect(() => apiTokenName('   ')).toThrow(ApiTokenError)
    expect(() => apiTokenName(undefined)).toThrow(ApiTokenError)
  })

  it('rejects an over-long name', () => {
    expect(() => apiTokenName('x'.repeat(61))).toThrow(ApiTokenError)
  })

  it('accepts a name at the limit', () => {
    expect(apiTokenName('x'.repeat(60)).length).toBe(60)
  })
})

describe('assertApiTokenPurgeable', () => {
  it('allows deleting a revoked token', () => {
    expect(() =>
      assertApiTokenPurgeable({ revokedAt: new Date() })
    ).not.toThrow()
  })

  it('refuses a live token, so delete can never stand in for revoke', () => {
    // Deleting a live token would drop the consumer with nothing recorded;
    // revoking first is what leaves the trail explaining the outage.
    expect(() => assertApiTokenPurgeable({ revokedAt: null })).toThrow(
      ApiTokenError
    )
    expect(() => assertApiTokenPurgeable({})).toThrow(ApiTokenError)
  })

  it('reports 409: the row exists, the state is wrong', () => {
    try {
      assertApiTokenPurgeable({ revokedAt: null })
    } catch (error) {
      expect((error as ApiTokenError).statusCode).toBe(409)
    }
  })
})
