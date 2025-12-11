import { PrismaClient } from './client/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:../runtime/db/dev.db',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  // 创建一个 Project
  const project = await prisma.project.create({
    data: {
      name: 'Welcome Project',
      description: 'This is a welcome project',
    },
  })

  // 创建一个 Page 并关联到上面的 Project
  await prisma.page.create({
    data: {
      name: 'Welcome Page',
      image: '/runtime/uploads/welcome.png',
      project: {
        connect: { id: project.id },
      },
    },
  })

  console.log('Seed 数据插入成功')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
