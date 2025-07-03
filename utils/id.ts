import type { ID } from '~/types/global'
import { zID } from '~/constants/schemas'

export function validID(id: ID): boolean {
  return zID.safeParse(id).success
}

export function numericID(id: ID): number {
  if (validID(id)) {
    if (typeof id === 'string') {
      const nID = parseInt(id, 10)
      if (!isNaN(nID)) {
        return nID
      } else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid id format',
        })
      }
    }
    if (typeof id === 'number') {
      return id
    }
  } else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }
  return NaN
}
