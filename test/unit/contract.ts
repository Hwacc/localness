import { expect } from 'vitest'
import type { ZodType } from 'zod'

/**
 * Checks a value against a published `@localness/contract` schema the way a
 * plugin would meet it: after a trip through JSON, so a `Date` is already a
 * string and an `undefined` field is already gone.
 *
 * The contract schemas strip unknown fields, so comparing the parsed result to
 * the wire value also catches the reverse mistake: a field the server sends
 * that the contract does not declare. Both directions fail the test.
 */
export function expectContract<T>(schema: ZodType<T>, value: unknown) {
  const wire = JSON.parse(JSON.stringify(value))
  expect(schema.parse(wire)).toEqual(wire)
}
