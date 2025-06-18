import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 创建一个 Project
  const project = await prisma.project.create({
    data: {
      name: 'Test Project',
      description: 'This is a test project',
    },
  })

  // 创建一个 Page 并关联到上面的 Project
  const page = await prisma.page.create({
    data: {
      name: 'Welcome Page',
      image: 'https://example.com/image.png',
      Project: {
        connect: { id: project.id },
      },
    },
  })

  // 创建多个 Tag 并关联到上面的 Page
  await prisma.tag.createMany({
    data: [
      {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        editable: true,
        className: 'text-box',
        fill: '#ffffff',
        stroke: '#000000',
        i18nKey: 'welcome.text',
        pageId: page.id,
      },
      {
        x: 150,
        y: 30,
        width: 80,
        height: 40,
        editable: false,
        className: 'image-box',
        fill: '#eeeeee',
        stroke: '#111111',
        i18nKey: null,
        pageId: page.id,
      },
    ],
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
