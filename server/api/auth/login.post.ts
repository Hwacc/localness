import prisma from '~/lib/prisma'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { omit } from 'lodash-es'

export default defineEventHandler(async (event) => {
  const { username, password } = await readBody(event)
  if (!username || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing username or password',
    })
  }

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

  const verifyPassword = await bcrypt.compare(password, user.password)
  if (!verifyPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid password',
    })
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    process.env.NUXT_JWT_SECRET as string,
    {
      expiresIn: '30d',
    }
  )

  return {
    token,
    user: omit(user, ['password', 'createdAt', 'updatedAt']),
  }
})
