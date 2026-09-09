import type { H3Event } from 'h3'
import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { TeamRole, UserRole } from '#shared/constants'

export async function requirePlatformAdmin(event: H3Event) {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, username: true },
  })
  if (!user || user.role !== UserRole.ADMIN) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }
  return { session, user }
}

export async function requireTeamOwner(event: H3Event, teamId: number) {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const membership = await prisma.userTeam.findUnique({
    where: {
      userId_teamId: { userId, teamId },
    },
  })
  if (!membership || membership.role !== TeamRole.OWNER) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }
  return { session, membership, userId }
}

export async function requireTeamMember(event: H3Event, projectId: number) {
  const session = await requireUserSession(event)
  const userId = numericID(session.user.id)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, teamId: true },
  })
  if (!project) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Project not found',
    })
  }
  const membership = await prisma.userTeam.findUnique({
    where: {
      userId_teamId: { userId, teamId: project.teamId },
    },
  })
  if (!membership) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }
  return { session, project, membership, userId }
}

export async function requirePageTeamMember(event: H3Event, pageId: number) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, projectID: true },
  })
  if (!page?.projectID) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Page not found',
    })
  }
  const access = await requireTeamMember(event, page.projectID)
  return { ...access, page }
}

export async function requireTagTeamMember(event: H3Event, tagId: number) {
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    select: {
      id: true,
      page: { select: { projectID: true } },
    },
  })
  if (!tag?.page.projectID) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Tag not found',
    })
  }
  const access = await requireTeamMember(event, tag.page.projectID)
  return { ...access, tag }
}

export async function requireI18nKeyTeamMember(
  event: H3Event,
  i18nKeyId: number
) {
  const i18nKey = await prisma.i18nKey.findUnique({
    where: { id: i18nKeyId },
    select: { id: true, projectId: true },
  })
  if (!i18nKey) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Translation not found',
    })
  }
  const access = await requireTeamMember(event, i18nKey.projectId)
  return { ...access, i18nKey }
}
