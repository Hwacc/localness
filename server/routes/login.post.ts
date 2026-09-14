import prisma from '#server/libs/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod/v4'
import { readZodBody } from '#server/helper/validate'
import { loadPublicUser } from '#server/helper/atlassian-auth'
import { sessionCookieOptions } from '#server/helper/session'
import type { UserRole } from '#shared/constants'

const zLogin = z.object({
  username: z.string().min(3, 'Username needs at least 3 characters'),
  password: zPassword,
})

/**
 * @route POST /login
 * @description Login
 * @access Public
 */
export default defineEventHandler(async (event) => {
  const { username, password } = await readZodBody(event, zLogin.parse)

  const user = await prisma.user.findUnique({
    where: {
      username: username,
    },
  })
  // One message for both branches: friendlier than "User not found", and it
  // does not tell a stranger which usernames exist.
  const wrongCredentials = () =>
    createError({
      statusCode: 400,
      statusMessage: 'Incorrect username or password. Please try again.',
    })
  if (!user) throw wrongCredentials()

  const verified = await bcrypt.compare(password, user.password)
  if (!verified) throw wrongCredentials()
  await setUserSession(
    event,
    {
      user: {
        id: user.id,
        username: user.username,
        role: user.role as UserRole,
      },
    },
    sessionCookieOptions(event)
  )
  return {
    user: await loadPublicUser(user.id),
  }
})
