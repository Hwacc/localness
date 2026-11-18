import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keyConventionSchema } from '#shared/contract'
import { expectContract } from './contract'

const db = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
}))

vi.mock('#server/libs/prisma', () => ({
  default: { projectSettings: { findUnique: async () => db.settings } },
}))
vi.mock('#server/helper/api-token', () => ({
  authenticateWriteRequest: async () => ({ id: 1, createdBy: 1 }),
  touchApiToken: async () => {},
}))
vi.mock('#server/helper/api-token-project', () => ({
  resolveTokenProject: async () => 1,
}))

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRequestHeader', () => 'Bearer lns_x')
vi.stubGlobal('getQuery', () => ({}))

const handler = (await import('#server/api/v1/key-convention.get')).default as (
  event: unknown,
) => Promise<any>

beforeEach(() => {
  db.settings = null
})

describe('GET /api/v1/key-convention', () => {
  it('falls back to the defaults when the project has no settings row', async () => {
    const body = await handler({})
    expect(body).toEqual({
      prefix: '',
      separator: '_',
      style: 'snake_case',
      maxDepth: 4,
      prompt: null,
    })
    expectContract(keyConventionSchema, body)
  })

  it('returns the project convention and treats an empty prompt as unset', async () => {
    db.settings = {
      keyPrefix: 'shop',
      keySeparator: '.',
      keyStyle: 'camelCase',
      keyMaxDepth: 3,
      prompt: '',
    }
    expect(await handler({})).toEqual({
      prefix: 'shop',
      separator: '.',
      style: 'camelCase',
      maxDepth: 3,
      prompt: null,
    })
    db.settings.prompt = 'Name by screen first'
    expect((await handler({})).prompt).toBe('Name by screen first')
  })
})
