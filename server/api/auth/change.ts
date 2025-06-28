import bcrypt from 'bcryptjs'
import { zPassword } from '~/constants/schemas'
import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'

const zAuth = z.object({
  password: zPassword,
})
/**
 * Change password
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { password } = await readValidatedBody(event, zAuth.parse)

  const hashedPassword = await bcrypt.hash(
    password,
    process.env.NUXT_SALT_SIZE ? parseInt(process.env.NUXT_SALT_SIZE) : 10
  )
  const data = {
    password: hashedPassword,
  }
  await prisma.user.update({
    where: {
      id: parseInt(session.user.id + ''),
      username: session.user.username,
    },
    data,
  })
  return { success: true }
})
