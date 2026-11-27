import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * `deleteProject` against a migrated SQLite file. Audit logs are
 * ON DELETE NO ACTION, so a project that has been edited cannot be deleted
 * unless those foreign keys are cleared first.
 */

const root = mkdtempSync(join(tmpdir(), 'localness-project-delete-'))
const dbFile = join(root, 'delete.db')
const migrations = join(process.cwd(), 'prisma', 'migrations')
const sqlite = new Database(dbFile)
for (const dir of readdirSync(migrations)
  .filter((name) => /^\d/.test(name))
  .sort()) {
  sqlite.exec(readFileSync(join(migrations, dir, 'migration.sql'), 'utf8'))
}
sqlite.close()
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, '/')}`

const { default: prisma } = await import('#server/libs/prisma')
const { deleteProject } = await import('#server/helper/project-delete')

const storage = { removeItem: async () => undefined }

afterAll(async () => {
  await prisma.$disconnect()
  rmSync(root, { recursive: true, force: true })
})

async function seedProject(name: string) {
  const team = await prisma.team.create({ data: { name } })
  const project = await prisma.project.create({
    data: { name, teamId: team.id },
  })
  const page = await prisma.page.create({
    data: { name: 'home', projectID: project.id },
  })
  const tag = await prisma.tag.create({
    data: {
      tagID: 'tag-1',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      className: 'text',
      pageID: page.id,
    },
  })
  const key = await prisma.i18nKey.create({
    data: { projectId: project.id, key: 'home.title' },
  })
  const projectLog = await prisma.projectLog.create({
    data: { action: 'UPDATE', status: 'SUCCESS', projectID: project.id },
  })
  const pageLog = await prisma.pageLog.create({
    data: { action: 'UPDATE', status: 'SUCCESS', pageID: page.id },
  })
  const tagLog = await prisma.tagLog.create({
    data: { action: 'UPDATE', status: 'SUCCESS', tagID: tag.id },
  })
  const translationLog = await prisma.translationLog.create({
    data: { action: 'UPDATE', status: 'SUCCESS', i18nKeyId: key.id },
  })
  return {
    projectId: project.id,
    projectLogId: projectLog.id,
    pageLogId: pageLog.id,
    tagLogId: tagLog.id,
    translationLogId: translationLog.id,
  }
}

describe('deleteProject', () => {
  it('keeps the project and its log links when the name does not match', async () => {
    const seeded = await seedProject('keep-me')
    const deleted = await deleteProject(seeded.projectId, 'other-name', storage)
    expect(deleted).toBe(false)
    expect(
      await prisma.project.findUnique({ where: { id: seeded.projectId } })
    ).not.toBeNull()
    expect(
      await prisma.projectLog.findUnique({ where: { id: seeded.projectLogId } })
    ).toMatchObject({ projectID: seeded.projectId })
    expect(
      await prisma.translationLog.findUnique({
        where: { id: seeded.translationLogId },
      })
    ).toMatchObject({ i18nKeyId: expect.any(Number) })
  })

  it('deletes a project that has audit logs and leaves those rows unlinked', async () => {
    const seeded = await seedProject('Welcome Project')
    const deleted = await deleteProject(
      seeded.projectId,
      'Welcome Project',
      storage
    )
    expect(deleted).toBe(true)
    expect(
      await prisma.project.findUnique({ where: { id: seeded.projectId } })
    ).toBeNull()
    expect(await prisma.page.count({ where: { projectID: seeded.projectId } })).toBe(0)
    expect(await prisma.i18nKey.count({ where: { projectId: seeded.projectId } })).toBe(0)
    expect(
      await prisma.projectLog.findUnique({ where: { id: seeded.projectLogId } })
    ).toMatchObject({ projectID: null })
    expect(
      await prisma.pageLog.findUnique({ where: { id: seeded.pageLogId } })
    ).toMatchObject({ pageID: null })
    expect(
      await prisma.tagLog.findUnique({ where: { id: seeded.tagLogId } })
    ).toMatchObject({ tagID: null })
    expect(
      await prisma.translationLog.findUnique({
        where: { id: seeded.translationLogId },
      })
    ).toMatchObject({ i18nKeyId: null })
  })
})
