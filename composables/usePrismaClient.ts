import { useNuxtApp } from '#imports'
import type { CustomPrismaClient } from '~/lib/prisma'

export function usePrismaClient() {
  return useNuxtApp().$prisma as CustomPrismaClient
}
