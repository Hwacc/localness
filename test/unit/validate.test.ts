import { describe, expect, it } from 'vitest'
import { zodIssuesOf } from '#server/helper/validate'

/** Roughly what h3's `validateData` throws when a schema rejects the body. */
function validationError(issues: unknown) {
  return Object.assign(new Error('Validation Error'), {
    statusCode: 400,
    statusMessage: 'Validation Error',
    data: { issues },
  })
}

describe('zodIssuesOf', () => {
  it('reads the issues h3 attaches to a rejected body', () => {
    const issues = [{ code: 'too_small', path: ['name'], message: 'Too small' }]
    expect(zodIssuesOf(validationError(issues))).toEqual(issues)
  })

  // The regression: this one carries a sentence, not JSON. Parsing `message`
  // blind reported its 400 as a 500.
  it('returns null for a body that never reached zod', () => {
    const malformed = Object.assign(new Error('Invalid JSON body'), {
      statusCode: 400,
      statusMessage: 'Bad Request',
    })
    expect(zodIssuesOf(malformed)).toBeNull()
  })

  it('returns null for anything without a usable issues array', () => {
    expect(zodIssuesOf(new Error('boom'))).toBeNull()
    expect(zodIssuesOf(null)).toBeNull()
    expect(zodIssuesOf(undefined)).toBeNull()
    expect(zodIssuesOf({ data: { issues: 'not-an-array' } })).toBeNull()
  })
})
