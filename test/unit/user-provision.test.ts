import { describe, expect, it } from 'vitest'
import {
  normalizeUserListPaging,
  zUserProvision,
} from '#server/helper/user-provision'

const valid = { username: 'alice', password: 'abc123' }

describe('zUserProvision', () => {
  it('accepts the two required fields and nulls the optional ones', () => {
    const parsed = zUserProvision.parse(valid)
    expect(parsed).toEqual({
      username: 'alice',
      password: 'abc123',
      email: null,
      nickname: null,
    })
  })

  it('trims the username', () => {
    expect(zUserProvision.parse({ ...valid, username: '  alice  ' }).username).toBe(
      'alice'
    )
  })

  it('rejects a username that is too short once trimmed', () => {
    expect(
      zUserProvision.safeParse({ ...valid, username: ' ab ' }).success
    ).toBe(false)
  })

  it('rejects a password that breaks the shared rule', () => {
    expect(
      zUserProvision.safeParse({ ...valid, password: 'abcdef' }).success
    ).toBe(false)
    expect(
      zUserProvision.safeParse({ ...valid, password: 'a1' }).success
    ).toBe(false)
  })

  it('rejects an invalid email but treats a blank one as absent', () => {
    expect(
      zUserProvision.safeParse({ ...valid, email: 'not-an-email' }).success
    ).toBe(false)
    expect(zUserProvision.parse({ ...valid, email: '' }).email).toBeNull()
    expect(
      zUserProvision.parse({ ...valid, email: 'a@b.co' }).email
    ).toBe('a@b.co')
  })

  it('treats a blank nickname as absent', () => {
    expect(zUserProvision.parse({ ...valid, nickname: '' }).nickname).toBeNull()
    expect(zUserProvision.parse({ ...valid, nickname: 'Al' }).nickname).toBe('Al')
  })

  it('has no way to ask for a role', () => {
    const parsed = zUserProvision.parse({ ...valid, role: 'ADMIN' })
    expect(parsed).not.toHaveProperty('role')
  })
})

describe('normalizeUserListPaging', () => {
  it('defaults when nothing usable is given', () => {
    expect(normalizeUserListPaging({})).toEqual({ page: 1, pageSize: 20 })
    expect(normalizeUserListPaging({ page: 'x', pageSize: '-3' })).toEqual({
      page: 1,
      pageSize: 20,
    })
  })

  it('caps the page size', () => {
    expect(normalizeUserListPaging({ page: '2', pageSize: '500' })).toEqual({
      page: 2,
      pageSize: 50,
    })
  })
})
