import { useNuxtApp } from '#imports'
import type { CustomPrismaClient } from '~/libs/prisma'

export function usePrismaClient() {
  return useNuxtApp().$prisma as CustomPrismaClient
}
