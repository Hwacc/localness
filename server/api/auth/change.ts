import bcrypt from 'bcryptjs'
import { z } from 'zod/v4'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'

const zAuth = z.object(
  {
    password: zPassword,
  },
  'Change password failed, please check your input'
)

/**
 * @route POST /auth/change
 * @description Change password
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { password } = await readZodBody(event, zAuth.parse)

  const hashedPassword = await bcrypt.hash(
    password,
    process.env.NUXT_SALT_SIZE ? parseInt(process.env.NUXT_SALT_SIZE) : 10
  )
  const data = {
    password: hashedPassword,
  }
  const id = numericID(session.user.id)
  await prisma.user.update({
    where: {
      id,
      username: session.user.username,
    },
    data,
  })
  return { success: true }
})
