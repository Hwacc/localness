import prisma from '~/lib/prisma'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await prisma.$disconnect()
  })
})
