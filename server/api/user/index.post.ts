import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'

const zProfile = z.object({
  nickname: z.string().min(3).nullable().optional(),
  email: z.email().nullable().optional(),
  avatar: z.string().nullable().optional(),
})
/**
 * @route POST /api/user
 * @description Update current user
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)

  const data = await readValidatedBody(event, zProfile.parse)

  const user = await prisma.user.update({
    where: {
      id: parseInt(session.user.id + ''),
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
