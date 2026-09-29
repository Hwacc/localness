import prisma from '#server/libs/prisma'
import { requirePlatformAdmin } from '#server/helper/access'
import { normalizeUserListPaging } from '#server/helper/user-provision'

/**
 * @route GET /api/users
 * @description Paged account list (platform ADMIN). Never returns passwords.
 */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const { page, pageSize } = normalizeUserListPaging(getQuery(event))

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.user.count(),
  ])
  return { items, total, page, pageSize }
})
