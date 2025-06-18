import type dayjs from 'dayjs'
import type { PrismaClient } from '@prisma/client'

declare module '#app' {
  interface NuxtApp {
    $prisma: PrismaClient
    $dayjs: typeof dayjs
  }
}

declare type ID = string | number
