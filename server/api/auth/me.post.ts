import type { UserRole } from '~/constants'
import type { ID } from '~/types/global'
import jwt from 'jsonwebtoken'
import prisma from '~/lib/prisma'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.split(' ')[1]

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  const decoded = jwt.verify(
    token,
    process.env.NUXT_JWT_SECRET as string
  ) as jwt.JwtPayload & {
    id: ID
    username: string
    role: UserRole
  }

  console.log('decoded', decoded)

  const user = await prisma.user.findUnique({
    where: { username: decoded.username },
  })

  return {
    success: true,
    user,
    token,
  }
})
