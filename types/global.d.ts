import type dayjs from 'dayjs'
import type { PrismaClient } from '@prisma/client'
import type { cn } from '~/utils'
declare module '#app' {
  interface NuxtApp {
    $prisma: PrismaClient
    $dayjs: typeof dayjs
    $cn: typeof cn
  }
}

declare type ID = string | number
