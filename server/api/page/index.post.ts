import prisma from '~/libs/prisma'
import zod from 'zod'

const zPage = zod.object({
  projectID: zod.number().nonnegative(),
  name: zod.string().min(3),
  image: zod.string().nonempty(), // image key
})
/**
 * @route POST /api/page
 * @description Create a new page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const { projectID, name, image } = await readValidatedBody(event, zPage.parse)

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
