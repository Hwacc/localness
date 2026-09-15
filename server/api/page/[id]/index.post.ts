import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import { requirePageTeamMember } from '#server/helper/access'
import { setEntryReleases, throwReleaseHttp } from '#server/helper/release'
import { z } from 'zod/v4'

/**
 * @route POST /api/page/:id
 * @description Update a page
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing id',
    })
  }
  const nID = numericID(id)
  const access = await requirePageTeamMember(event, nID)
  const { name, image, settings, releaseIds } = await readZodBody(
    event,
    zPage.extend({
      image: z.string().optional(),
    }).parse
  )
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing name',
    })
  }

  // Absent means "leave the labels alone"; an empty array means "clear them".
  if (releaseIds) {
    try {
      await setEntryReleases({
        projectId: access.project.id,
        kind: 'page',
        id: nID,
        releaseIds,
      })
    } catch (error) {
      throwReleaseHttp(error)
    }
  }

  const data = image ? { name, image } : { name }
  if (settings) {
    await prisma.pageSettings.upsert({
      where: {
        pageID: nID,
      },
      create: {
        pageID: nID,
        ocrLanguage: settings?.ocrLanguage ?? 'eng',
        ocrEngine: settings?.ocrEngine ?? 1,
        prompt: settings?.prompt ?? '',
      },
      update: settings,
    })
  }
  const updatedProject = await prisma.page.update({
    where: {
      id: nID,
    },
    data,
    select: {
      id: true,
      name: true,
      image: true,
      updatedAt: true,
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

  // `releaseIds`, matching the project payload, so the client can update its
  // cached page in place instead of refetching the project.
  const { releases, ...page } = updatedProject
  return { ...page, releaseIds: releases.map((row) => row.releaseId) }
})
