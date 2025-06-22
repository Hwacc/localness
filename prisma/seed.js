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
      project: {
        connect: { id: project.id },
      },
    },
  })

  // 创建 Translations
  const [welcomeTranslation, buttonTranslation] = await Promise.all([
    prisma.translation.create({
      data: {
        i18nKey: 'welcome.text',
        origin: 'Welcome to our website',
        en: 'Welcome to our website',
        zh: '欢迎访问我们的网站',
      },
    }),
    prisma.translation.create({
      data: {
        i18nKey: 'button.submit',
        origin: 'Submit',
        en: 'Submit',
        zh: '提交',
      },
    }),
  ])

  // 创建 Tags
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
        pageID: page.id,
        translationID: welcomeTranslation.id,
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
        i18nKey: 'button.submit',
        pageID: page.id,
        translationID: buttonTranslation.id,
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
