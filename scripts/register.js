// register.js
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import readline from 'readline'
import 'dotenv/config'
import 'nuxt-auth-utils'

const prisma = new PrismaClient()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function register() {
  const username = await askQuestion('请输入用户名：')
  const password = await askQuestion('请输入密码：', true)
  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]{6,16}$/
  if (!passwordRegex.test(password)) {
    console.log('密码需要有字母,数字和_组成,最少包含一个字母和数字,最短6位,最长16位')
    return
  }
  const confirmPassword = await askQuestion('请再次输入密码：', true)
  if (password !== confirmPassword) {
    console.log('两次输入的密码不一致！')
    return
  }
  const role = await askRole()
  const hashedPassword = await bcrypt.hash(
    password,
    process.env.NUXT_SALT_SIZE ? parseInt(process.env.NUXT_SALT_SIZE) : 10
  )
  try {
    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role,
      },
    })
    console.log('注册成功！')
  } catch (error) {
    console.error('注册失败：', error)
  }
}

async function askQuestion(question, isPassword = false) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (isPassword) {
        console.log('*'.repeat(answer.length))
      }
      resolve(answer)
    })
  })
}

async function askRole() {
  const roles = ['ADMIN', 'USER', 'GUEST']
  console.log('请选择角色：')
  for (let i = 0; i < roles.length; i++) {
    console.log(`${i + 1}. ${roles[i]}`)
  }
  const answer = await askQuestion('请输入角色编号：')
  const roleIndex = parseInt(answer) - 1
  if (roleIndex >= 0 && roleIndex < roles.length) {
    return roles[roleIndex]
  } else {
    console.log('无效的角色编号！')
    return askRole()
  }
}

register().then(() => {
  rl.close()
})
