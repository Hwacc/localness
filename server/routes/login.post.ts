import prisma from '~/libs/prisma'
import { omit } from 'lodash-es'
import bcrypt from 'bcryptjs'
import zod from 'zod'

const zLogin = zod.object({
  username: zod.string().min(3),
  password: zod.string().min(3),
})
export default defineEventHandler(async (event) => {
  const {username, password} = await readValidatedBody(event, zLogin.parse)

  const user = await prisma.user.findUnique({
    where: {
      username: username,
    },
  })
  if (!user) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User not found',
    })
  }

  const verified = await bcrypt.compare(password, user.password)
  if (!verified) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid password',
    })
  }
  
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    }
  }, {
    maxAge: 60 * 60 * 24 * 30,
  })

  return {
    user: omit(user, ['password', 'createdAt', 'updatedAt']),
  }
})
