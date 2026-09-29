import { describe, expect, it } from 'vitest'
import { zOptionalEmail, zOptionalNickname } from '#shared/utils/schemas'

describe('zOptionalNickname', () => {
  it('treats a cleared field as "clear it"', () => {
    expect(zOptionalNickname.parse('')).toBeNull()
  })

  it('leaves an omitted field alone and keeps null as null', () => {
    expect(zOptionalNickname.parse(undefined)).toBeUndefined()
    expect(zOptionalNickname.parse(null)).toBeNull()
  })

  it('still enforces the length once something is typed', () => {
    expect(zOptionalNickname.safeParse('ab').success).toBe(false)
    expect(zOptionalNickname.parse('abc')).toBe('abc')
  })
})

describe('zOptionalEmail', () => {
  it('treats a cleared field as "clear it"', () => {
    expect(zOptionalEmail.parse('')).toBeNull()
  })

  it('leaves an omitted field alone and keeps null as null', () => {
    expect(zOptionalEmail.parse(undefined)).toBeUndefined()
    expect(zOptionalEmail.parse(null)).toBeNull()
  })

  it('still rejects a malformed address', () => {
    expect(zOptionalEmail.safeParse('not-an-email').success).toBe(false)
    expect(zOptionalEmail.parse('a@b.co')).toBe('a@b.co')
  })
})
