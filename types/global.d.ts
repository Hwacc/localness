import type dayjs from 'dayjs'
import type { PrismaClient } from '@prisma/client'
import type { cn } from '~/utils'
import type { IUser } from './interfaces'

declare module '#app' {
  interface NuxtApp {
    $prisma: PrismaClient
    $dayjs: typeof dayjs
    $cn: typeof cn
  }
}

declare type ID = string | number

declare module '#auth-utils' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends IUser {}

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SecureSessionData{}
}