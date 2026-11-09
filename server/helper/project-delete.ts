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

/**
 * Hard-delete a project. Every child table cascades on the Project relation, so
 * one delete takes pages, tags, keys, locale values, releases and grants with
 * it. Stored files have no foreign key: collect their keys first, delete the row,
 * then drop the files best-effort so a leftover blob never blocks the delete.
 */
export async function deleteProject(
  projectId: number,
  name: string,
  storage: Storage
) {
  const [pages, skills] = await Promise.all([
    prisma.page.findMany({
      where: { projectID: projectId, image: { not: null } },
      select: { image: true },
    }),
    prisma.projectSkill.findMany({
      where: { projectId },
      select: { storageKey: true },
    }),
  ])
  // Name is re-checked in the same statement so a rename between the dialog and
  // the request cannot delete the wrong thing.
  const { count } = await prisma.project.deleteMany({
    where: { id: projectId, name },
  })
  if (count === 0) return false

  const imageKeys = new Set(pages.map((page) => page.image as string))
  for (const key of imageKeys) {
    try {
      await discardReplacedPageImage(storage, key)
    } catch (error) {
      console.error(error)
    }
  }
  for (const { storageKey } of skills) {
    try {
      await storage.removeItem(storageKey)
    } catch (error) {
      console.error(error)
    }
  }
  return true
}
