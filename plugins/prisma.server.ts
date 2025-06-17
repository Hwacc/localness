import { defineNuxtPlugin } from '#imports'
import prisma from '~/lib/prisma'

export default defineNuxtPlugin({
  name: 'prisma-client',
  enforce: 'pre',
  async setup() {
    return {
      provide: {
        prisma: prisma,
      },
    }
  },
  env: {
    islands: true,
  },
})
