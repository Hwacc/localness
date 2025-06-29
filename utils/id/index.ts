import type { ID } from '~/types/global'
import { zID } from '~/constants/schemas'

export function validID(id: ID): boolean {
  return zID.safeParse(id).success
}

export function numericID(id: ID): number {
  if (validID(id)) {
    if (typeof id === 'string') {
      return parseInt(id, 10)
    }
    if (typeof id === 'number') {
      return id
    }
  }
  return NaN
}
