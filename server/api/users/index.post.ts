import bcrypt from 'bcryptjs'
import prisma from '#server/libs/prisma'
import { requirePlatformAdmin } from '#server/helper/access'
import { readZodBody } from '#server/helper/validate'
import {
  USER_ADMIN_LOG_ACTION_CREATE,
  zUserProvision,
} from '#server/helper/user-provision'
import { UserRole } from '#shared/constants'

/**
 * @route POST /api/users
 * @description Open a plain USER account (platform ADMIN).
 *
 * The role is not read from the body: this endpoint can only ever create USER.
 * The audit row never carries the password or its hash.
 */
export default defineEventHandler(async (event) => {
  const { user: actor } = await requirePlatformAdmin(event)
  const { username, password, email, nickname } = await readZodBody(
    event,
    zUserProvision.parse
  )

  const hashedPassword = await bcrypt.hash(
    password,
    process.env.NUXT_SALT_SIZE ? parseInt(process.env.NUXT_SALT_SIZE) : 10
  )

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          passwordSetAt: new Date(),
          role: UserRole.USER,
          email,
          nickname,
        },
        select: {
          id: true,
          username: true,
          nickname: true,
          email: true,
          role: true,
          createdAt: true,
        },
      })
      await tx.userAdminLog.create({
        data: {
          action: USER_ADMIN_LOG_ACTION_CREATE,
          actorId: actor.id,
          targetId: created.id,
          afterData: { username: created.username, role: created.role },
        },
      })
      return created
    })
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: string }).code)
        : ''
    if (code === 'P2002') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Username already exists',
      })
    }
    throw error
  }
})
