import type dayjs from 'dayjs'
import type { PrismaClient } from '@prisma/client'
import type { cn } from '~/utils'
import type { IUser } from './User'
import type { FIFOCache } from 'fifo-ttl-cache'

declare module '#app' {
  interface NuxtApp {
    $prisma: PrismaClient
    $dayjs: typeof dayjs
    $cn: typeof cn
    $imageCache: FIFOCache<string, ImageCache>
  }
}

declare module '#auth-utils' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends IUser {}

  interface AgentJWT {
    token_type: string
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface SecureSessionData{}
}

declare module '*?worker' {
  const WorkerFactory: {
    new (): Worker
  }
  export default WorkerFactory
}