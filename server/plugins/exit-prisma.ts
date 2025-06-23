import prisma from '~/libs/prisma'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', async () => {
    await prisma.$disconnect()
  })
})
