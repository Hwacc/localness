import prisma from '#server/libs/prisma'
import { readZodBody } from '#server/helper/validate'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import {
  assertReleaseIdsInProject,
  setEntryReleases,
  throwReleaseHttp,
} from '#server/helper/release'

/**
 * @route POST /api/page
 * @description Create a new page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  const { projectID, name, image, settings, releaseIds } = await readZodBody(
    event,
    zPage.extend({
      projectID: zID,
    }).parse
  )
  if (!projectID) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing projectID',
    })
  }
  const nProjectID = numericID(projectID)
  await requireTeamMember(event, nProjectID)

  const belongProject = await prisma.project.findUnique({
    where: {
      id: nProjectID,
    },
    include: {
      settings: true,
    },
  })
  if (!belongProject) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Project not found',
    })
  }

  // Before the write: a bad label id must not leave a half-created page behind.
  let attachReleaseIds: number[] = []
  try {
    attachReleaseIds = await assertReleaseIdsInProject({
      projectId: nProjectID,
      releaseIds: releaseIds ?? [],
    })
  } catch (error) {
    throwReleaseHttp(error)
  }

  const createdPage = await prisma.page.create({
    data: {
      name,
      image,
      projectID: nProjectID,
    },
    include: {
      tags: true,
    },
  })

  await prisma.pageSettings.create({
    data: {
      pageID: createdPage.id,
      ocrLanguage:
        settings?.ocrLanguage ?? belongProject.settings?.ocrLanguage ?? 'eng',
      ocrEngine: settings?.ocrEngine ?? belongProject.settings?.ocrEngine ?? 1,
      // Not copied from the project the way the OCR fields above are: a page
      // inherits the key convention by *staying* null. Copying would freeze
      // today's values into the page and stop it following the project.
      keyPrefix: settings?.keyPrefix ?? null,
      keySeparator: settings?.keySeparator ?? null,
      keyStyle: settings?.keyStyle ?? null,
      keyMaxDepth: settings?.keyMaxDepth ?? null,
    },
  })

  if (attachReleaseIds.length) {
    await setEntryReleases({
      projectId: nProjectID,
      kind: 'page',
      id: createdPage.id,
      releaseIds: attachReleaseIds,
    })
  }

  const created = await prisma.page.findUnique({
    where: {
      id: createdPage.id,
    },
    include: {
      tags: true,
      releases: { select: { releaseId: true } },
      settings: {
        omit: {
          id: true,
          pageID: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!created) return null
  /*
   * Without the labels, a page created while viewing one release would vanish
   * from the filtered list until a reload.
   */
  const { releases, ...page } = created
  return { ...page, releaseIds: releases.map((row) => row.releaseId) }
})
