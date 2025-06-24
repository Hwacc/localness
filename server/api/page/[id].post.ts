import prisma from '~/libs/prisma'
import { z } from 'zod/v4'

const zPage = z.object({
  name: z.string().min(3),
  image: z.string().nonempty().optional(),
})
/**
 * @route POST /api/page/:id
 * @description Update a page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const numericID = parseInt(id, 10)
  if (isNaN(numericID)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid id format',
    })
  }

  const { name, image } = await readValidatedBody(event, zPage.parse)
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }

  const data = image ? { name, image } : { name }
  const updatedProject = await prisma.page.update({
    where: {
      id: numericID,
    },
    data,
    select: {
      id: true,
      name: true,
      image: true,
      updatedAt: true,
    },
  })

  return updatedProject
})
