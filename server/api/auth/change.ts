import bcrypt from 'bcryptjs'
import { zPassword } from '~/utils/schemas'
import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '~/utils/id'
import { readZodBody } from '~/utils/validate'

const zAuth = z.object(
  {
    password: zPassword,
  },
  'Change password failed, please check your input'
)

/**
 * Change password
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
