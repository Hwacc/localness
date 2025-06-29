import bcrypt from 'bcryptjs'
import { zPassword } from '~/constants/schemas'
import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { numericID } from '~/utils/id'

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

  const nID = numericID(session.user.id)
  if (isNaN(nID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }
  await prisma.user.update({
    where: {
      id: nID,
      username: session.user.username,
    },
    data,
  })
  return { success: true }
})
