import { z } from 'zod/v4'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'

const zProfile = z.object(
  {
    nickname: z.string().min(3).nullable().optional(),
    email: z.email().nullable().optional(),
    avatar: z.string().nullable().optional(),
  },
  'User parameters validate failed'
)
/**
 * @route POST /api/user
 * @description Update current user
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const data = await readZodBody(event, zProfile.parse)
  const id = numericID(session.user.id)
  const user = await prisma.user.update({
    where: {
      id,
      username: session.user.username,
    },
    select: {
      id: true,
      username: true,
      email: true,
      avatar: true,
      nickname: true,
    },
    data,
  })
  return user
})
