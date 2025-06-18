declare module '#app' {
  interface NuxtApp {
    $prisma: import('@prisma/client').PrismaClient
  }
}

declare type ID = string | number