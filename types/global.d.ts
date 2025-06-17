declare module 'nitropack' {
  interface NitroRuntimeConfig {
    prisma: ReturnType<() => import('@prisma/client').PrismaClient>
  }

  interface NitroServerContext {
    $prisma: import('@prisma/client').PrismaClient
  }
}