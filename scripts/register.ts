import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import bcrypt from 'bcryptjs'
import { config as loadEnv } from 'dotenv'
import readline from 'readline'
import { PrismaClient } from '../prisma/client/client'
import { UserRole } from '../shared/constants'
import { zPassword } from '../shared/utils/schemas'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadEnv({ path: join(repoRoot, '.env') })

const databaseUrl = resolveDatabaseUrl(
  process.env.DATABASE_URL || 'file:./runtime/db/dev.db'
)
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
})

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const ROLES = [UserRole.ADMIN, UserRole.USER] as const

function resolveDatabaseUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw
  const filePath = raw.slice('file:'.length)
  if (isAbsolute(filePath)) return `file:${filePath}`
  return `file:${resolve(repoRoot, filePath)}`
}

function bcryptRounds(): number {
  const n = Number.parseInt(process.env.NUXT_SALT_SIZE || '10', 10)
  if (!Number.isFinite(n) || n < 4 || n > 15) return 10
  return n
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}

async function register() {
  const username = (await askQuestion('请输入用户名：')).trim()
  if (username.length < 3) {
    console.log('用户名至少 3 个字符（与登录规则一致）。')
    process.exitCode = 1
    return
  }

  const password = await askSecret('请输入密码：')
  const parsed = zPassword.safeParse(password)
  if (!parsed.success) {
    console.log(
      '密码需要有字母、数字和_组成，最少包含一个字母和数字，最短 6 位，最长 16 位。'
    )
    process.exitCode = 1
    return
  }
  const confirmPassword = await askSecret('请再次输入密码：')
  if (password !== confirmPassword) {
    console.log('两次输入的密码不一致！')
    process.exitCode = 1
    return
  }

  const role = await askRole()
  const hashedPassword = await bcrypt.hash(password, bcryptRounds())
  try {
    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        passwordSetAt: new Date(),
        role,
      },
    })
    console.log('注册成功！')
    console.log(`数据库 ${databaseUrl}`)
  } catch (error) {
    if (isUniqueConstraint(error)) {
      console.error('注册失败：用户名已存在。')
    } else {
      console.error('注册失败：', error)
    }
    process.exitCode = 1
  }
}

async function askQuestion(question: string): Promise<string> {
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => resolveAnswer(answer))
  })
}

async function askSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return askQuestion(prompt)
  }
  rl.pause()
  try {
    return await readHiddenLine(prompt)
  } finally {
    rl.resume()
  }
}

function readHiddenLine(prompt: string): Promise<string> {
  return new Promise((resolveLine, reject) => {
    const stdin = process.stdin
    process.stdout.write(prompt)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let buf = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r') {
          cleanup()
          process.stdout.write('\n')
          resolveLine(buf)
          return
        }
        if (ch === '\u0003') {
          cleanup()
          process.stdout.write('\n')
          reject(new Error('cancelled'))
          return
        }
        if (ch === '\u007f' || ch === '\b') {
          if (buf.length > 0) {
            buf = buf.slice(0, -1)
            process.stdout.write('\b \b')
          }
          continue
        }
        if (ch < ' ') continue
        buf += ch
        process.stdout.write('*')
      }
    }
    const cleanup = () => {
      stdin.off('data', onData)
      if (stdin.isTTY) stdin.setRawMode(false)
    }
    stdin.on('data', onData)
  })
}

async function askRole(): Promise<(typeof ROLES)[number]> {
  console.log('请选择角色：')
  console.log('1. ADMIN（平台管理员：开户、建 Team）')
  console.log('2. USER（普通账号）')
  const answer = await askQuestion('请输入角色编号：')
  const roleIndex = Number.parseInt(answer, 10) - 1
  const role = ROLES[roleIndex]
  if (role) return role
  console.log('无效的角色编号！')
  return askRole()
}

async function main() {
  try {
    await register()
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      process.exitCode = 1
    } else {
      console.error(error)
      process.exitCode = 1
    }
  } finally {
    rl.close()
    await prisma.$disconnect()
  }
}

void main()
