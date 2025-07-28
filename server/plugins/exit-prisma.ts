import prisma from '#server/libs/prisma'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await prisma.$disconnect()
  })
})
