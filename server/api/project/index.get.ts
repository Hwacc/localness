import prisma from '~/lib/prisma'

export default defineEventHandler(async () => {
  const projects = await prisma.project.findMany({
    include: {
      pages: true,
    },
  })
  return projects
})
