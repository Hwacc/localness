import { useNuxtApp } from '#imports'
import type { CustomPrismaClient } from '~/lib/prisma'

export const usePrismaClient = () => {
  return useNuxtApp().$prisma as CustomPrismaClient
}
