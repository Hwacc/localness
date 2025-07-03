import prisma from '~/server/libs/prisma'
import { z } from 'zod/v4'
import { readZodBody } from '~/utils/validate'

const zPage = z.object({
  projectID: z.number().nonnegative(),
  name: z.string().min(3),
  image: z.string().nonempty(), // image key
}, 'Page parameters validate failed')
/**
 * @route POST /api/page
 * @description Create a new page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { projectID, name, image } = await readZodBody(event, zPage.parse)

  const page = await prisma.page.create({
    data: {
      name,
      image,
      projectID,
    },
    include: {
      tags: true,
    },
  })
  return page
})
