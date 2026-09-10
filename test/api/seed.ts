import bcrypt from 'bcryptjs'
import { PrismaClient } from '../../prisma/client/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { FIXTURES } from './fixtures'

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const owner = await prisma.user.create({
    data: {
      username: FIXTURES.owner.username,
      password: await bcrypt.hash(FIXTURES.owner.password, 4),
      role: 'USER',
    },
  })
  await prisma.user.create({
    data: {
      username: FIXTURES.outsider.username,
      password: await bcrypt.hash(FIXTURES.outsider.password, 4),
      role: 'USER',
    },
  })
  const team = await prisma.team.create({ data: { name: 'Git Sync Test Team' } })
  await prisma.userTeam.create({
    data: { userId: owner.id, teamId: team.id, role: 'OWNER' },
  })
  await prisma.project.create({
    data: { name: 'Git Sync Test Project', teamId: team.id },
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
