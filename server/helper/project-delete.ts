import prisma from '#server/libs/prisma'
import { discardReplacedPageImage } from '#server/helper/page-image'

export interface ProjectDeleteSummary {
  name: string
  pages: number
  keys: number
  publishedKeys: number
  gitSyncEnabled: boolean
}

type Storage = { removeItem: (key: string) => Promise<unknown> }

export async function projectDeleteSummary(
  projectId: number
): Promise<ProjectDeleteSummary | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, gitSync: { select: { enabled: true } } },
  })
  if (!project) return null
  const [pages, keys, publishedKeys] = await Promise.all([
    prisma.page.count({ where: { projectID: projectId } }),
    prisma.i18nKey.count({ where: { projectId } }),
    prisma.i18nKey.count({
      where: { projectId, locales: { some: { publishedText: { not: null } } } },
    }),
  ])
  return {
    name: project.name,
    pages,
    keys,
    publishedKeys,
    gitSyncEnabled: project.gitSync?.enabled ?? false,
  }
}

/** Thrown inside the delete transaction so a raced rename rolls the unlinks back. */
class ProjectNameMismatch extends Error {}

/**
 * Hard-delete a project. Child tables cascade on the Project relation, so one
 * delete takes pages, tags, keys, locale values, releases and grants with it.
 * ProjectLog, PageLog, TagLog and TranslationLog stay as audit rows
 * (`ON DELETE NO ACTION`). Their foreign keys are nulled in the same
 * transaction first — the same unlink `purgeI18nKey` does for one key. Stored files have no foreign key: collect their keys, delete
 * the row, then drop the files best-effort so a leftover blob never blocks the
 * delete.
 */
export async function deleteProject(
  projectId: number,
  name: string,
  storage: Storage
) {
  let imageKeys: string[]
  let skillKeys: string[]
  try {
    const removed = await prisma.$transaction(async (tx) => {
      const match = await tx.project.findFirst({
        where: { id: projectId, name },
        select: { id: true },
      })
      if (!match) throw new ProjectNameMismatch()

      const [pages, skills, tags, keys] = await Promise.all([
        tx.page.findMany({
          where: { projectID: projectId },
          select: { id: true, image: true },
        }),
        tx.projectSkill.findMany({
          where: { projectId },
          select: { storageKey: true },
        }),
        tx.tag.findMany({
          where: { page: { projectID: projectId } },
          select: { id: true },
        }),
        tx.i18nKey.findMany({
          where: { projectId },
          select: { id: true },
        }),
      ])

      await tx.projectLog.updateMany({
        where: { projectID: projectId },
        data: { projectID: null },
      })
      const pageIds = pages.map((page) => page.id)
      if (pageIds.length > 0) {
        await tx.pageLog.updateMany({
          where: { pageID: { in: pageIds } },
          data: { pageID: null },
        })
      }
      const tagIds = tags.map((tag) => tag.id)
      if (tagIds.length > 0) {
        await tx.tagLog.updateMany({
          where: { tagID: { in: tagIds } },
          data: { tagID: null },
        })
      }
      const keyIds = keys.map((key) => key.id)
      if (keyIds.length > 0) {
        await tx.translationLog.updateMany({
          where: { i18nKeyId: { in: keyIds } },
          data: { i18nKeyId: null },
        })
      }

      // Name is re-checked in the same statement so a rename between the dialog
      // and the request cannot delete the wrong thing. A miss rolls back the
      // unlinks above.
      const { count } = await tx.project.deleteMany({
        where: { id: projectId, name },
      })
      if (count === 0) throw new ProjectNameMismatch()
      return {
        imageKeys: pages.flatMap((page) => (page.image ? [page.image] : [])),
        skillKeys: skills.map((skill) => skill.storageKey),
      }
    })
    imageKeys = removed.imageKeys
    skillKeys = removed.skillKeys
  } catch (error) {
    if (error instanceof ProjectNameMismatch) return false
    throw error
  }

  for (const key of new Set(imageKeys)) {
    try {
      await discardReplacedPageImage(storage, key)
    } catch (error) {
      console.error(error)
    }
  }
  for (const storageKey of skillKeys) {
    try {
      await storage.removeItem(storageKey)
    } catch (error) {
      console.error(error)
    }
  }
  return true
}
