import { createError } from 'h3'
import prisma from '#server/libs/prisma'
import type { ZApiV1Tag } from '#shared/utils/schemas'
import type {
  CreatePageResult,
  DeleteTagsResult,
  ImportedTag,
  ImportPageResult,
  ImportPageTags,
} from '#shared/types/Import'

/**
 * The write half of the delivery API: a design tool importing a frame as a page.
 *
 * The rules live here rather than in the endpoints because `test/stubs/h3.ts`
 * only stands in for `createError`, so anything left in a `.ts` endpoint is
 * untestable. `createError` is imported from `h3` for the same reason.
 *
 * Every function here takes the project as an argument, already authorized. The
 * caller established it — from `?project=` or from the page it addresses — so
 * what is left is the write itself, plus the one thing only this layer knows:
 * that a page named in a request belongs to the project being written to.
 */

/** What the editor uses for every tag it draws (`app/core/Editor.ts`). */
const TAG_CLASS_NAME = 'tag'

/**
 * Style has no database default, so it has to be written explicitly. Unlocked
 * and unstyled: an importer draws a rectangle, the editor is where it gets a
 * colour and a lock.
 */
const TAG_SETTINGS_DEFAULTS = { locked: false, style: {}, labelStyle: {} } as const

const TAG_FIELDS = {
  id: true,
  figmaNodeId: true,
  x: true,
  y: true,
  width: true,
  height: true,
  i18nKey: true,
  i18nKeyId: true,
} as const

function shapeTag(row: {
  id: number
  figmaNodeId: string | null
  x: number
  y: number
  width: number
  height: number
  i18nKey: string | null
  i18nKeyId: number | null
}): ImportedTag {
  return {
    id: row.id,
    figmaNodeId: row.figmaNodeId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    i18nKey: row.i18nKey,
    i18nKeyId: row.i18nKeyId,
  }
}

export async function assertPageInProject(pageId: number, projectId: number) {
  const page = await prisma.page.findFirst({
    where: { id: pageId, projectID: projectId },
    select: { id: true, name: true, image: true },
  })
  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
  return page
}

/**
 * One query for every key a batch mentions. The importer only ever sends names
 * it read out of published copy, so they already exist as rows — which is why
 * this is a lookup and not `resolveTagI18n`, whose job is to *create* keys and
 * write source text. Importing must never do that; that is the key generator's
 * job. An unknown name is simply absent from the map and the tag stays unbound.
 */
export async function resolveKeyIds(
  projectId: number,
  keys: Array<string | null | undefined>
): Promise<Map<string, number>> {
  const wanted = [...new Set(keys.filter((key): key is string => !!key))]
  if (wanted.length === 0) return new Map()
  const rows = await prisma.i18nKey.findMany({
    where: { projectId, key: { in: wanted } },
    select: { id: true, key: true },
  })
  return new Map(rows.map((row) => [row.key, row.id]))
}

export async function listPageTags(
  projectId: number,
  pageId: number
): Promise<ImportPageTags> {
  await assertPageInProject(pageId, projectId)
  const rows = await prisma.tag.findMany({
    where: { pageID: pageId },
    orderBy: { id: 'asc' },
    select: TAG_FIELDS,
  })
  return { pageId, tags: rows.map(shapeTag) }
}

export async function createPageWithTags(params: {
  projectId: number
  name: string
  image: string
  tags: ZApiV1Tag[]
}): Promise<CreatePageResult> {
  const { projectId, name, image, tags } = params
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { settings: true },
  })
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }
  const keyIds = await resolveKeyIds(
    projectId,
    tags.map((tag) => tag.i18nKey)
  )

  return prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { name, image, projectID: projectId },
    })
    await tx.pageSettings.create({
      data: {
        pageID: page.id,
        ocrLanguage: project.settings?.ocrLanguage ?? 'eng',
        ocrEngine: project.settings?.ocrEngine ?? 1,
        // Left null on purpose: that is how a page inherits the project's key
        // convention and keeps following it.
        keyPrefix: null,
        keySeparator: null,
        keyStyle: null,
        keyMaxDepth: null,
      },
    })

    const created: ImportedTag[] = []
    for (const tag of tags) {
      const keyId = tag.i18nKey ? (keyIds.get(tag.i18nKey) ?? null) : null
      const row = await tx.tag.create({
        data: {
          pageID: page.id,
          // The node id doubles as the editor-visible tag id: it is stable
          // across re-imports, which is what makes a tag self-describing in a
          // later diff. `tagID` carries no unique constraint.
          tagID: tag.figmaNodeId,
          className: TAG_CLASS_NAME,
          x: tag.x,
          y: tag.y,
          width: tag.width,
          height: tag.height,
          figmaNodeId: tag.figmaNodeId,
          i18nKey: keyId === null ? null : tag.i18nKey,
          i18nKeyId: keyId,
        },
        select: TAG_FIELDS,
      })
      await tx.tagSettings.create({
        data: { tagID: row.id, ...TAG_SETTINGS_DEFAULTS },
      })
      created.push(shapeTag(row))
    }

    return { id: page.id, name: page.name, image: page.image, tags: created }
  })
}

/**
 * Re-import. Geometry is the importer's; the key is the editor's, so an existing
 * tag's binding is never touched — a designer who re-pointed a tag at another
 * key by hand must keep that choice.
 *
 * Nothing is deleted. A tag whose node was not in this request comes back in
 * `stale` for the caller to act on deliberately.
 */
export async function upsertPageWithTags(params: {
  projectId: number
  pageId: number
  name?: string
  image?: string
  tags?: ZApiV1Tag[]
}): Promise<ImportPageResult> {
  const { projectId, pageId, name, image, tags } = params
  const page = await assertPageInProject(pageId, projectId)

  if (name !== undefined || image !== undefined) {
    await prisma.page.update({
      where: { id: pageId },
      data: {
        ...(name === undefined ? {} : { name }),
        ...(image === undefined ? {} : { image }),
      },
    })
  }

  const existing = await prisma.tag.findMany({
    where: { pageID: pageId, figmaNodeId: { not: null } },
    select: TAG_FIELDS,
  })
  const byNode = new Map(existing.map((row) => [row.figmaNodeId as string, row]))

  let created = 0
  let updated = 0
  const seen = new Set<string>()

  // `!== undefined`, not a length check: an empty array is a real statement —
  // "this frame has no text layers any more" — and every tag on the page is then
  // stale. Only an absent field is a request that never mentioned tags.
  if (tags !== undefined) {
    const keyIds = await resolveKeyIds(
      projectId,
      tags.map((tag) => tag.i18nKey)
    )
    for (const tag of tags) {
      seen.add(tag.figmaNodeId)
      const current = byNode.get(tag.figmaNodeId)
      if (current) {
        await prisma.tag.update({
          where: { id: current.id },
          // Geometry only. `i18nKey`/`i18nKeyId` are absent by construction.
          data: {
            x: tag.x,
            y: tag.y,
            width: tag.width,
            height: tag.height,
          },
        })
        updated += 1
        continue
      }
      const keyId = tag.i18nKey ? (keyIds.get(tag.i18nKey) ?? null) : null
      const row = await prisma.tag.create({
        data: {
          pageID: pageId,
          tagID: tag.figmaNodeId,
          className: TAG_CLASS_NAME,
          x: tag.x,
          y: tag.y,
          width: tag.width,
          height: tag.height,
          figmaNodeId: tag.figmaNodeId,
          i18nKey: keyId === null ? null : tag.i18nKey,
          i18nKeyId: keyId,
        },
        select: { id: true },
      })
      await prisma.tagSettings.create({
        data: { tagID: row.id, ...TAG_SETTINGS_DEFAULTS },
      })
      created += 1
    }
  }

  // Only meaningful when the caller actually sent a tag set; an update that
  // touched just the name must not report every tag on the page as stale.
  const stale =
    tags === undefined
      ? []
      : existing.filter((row) => !seen.has(row.figmaNodeId as string)).map(shapeTag)

  const current = await prisma.tag.findMany({
    where: { pageID: pageId },
    orderBy: { id: 'asc' },
    select: TAG_FIELDS,
  })

  return {
    pageId,
    name: name ?? page.name,
    image: image ?? page.image,
    created,
    updated,
    stale,
    tags: current.map(shapeTag),
  }
}

/**
 * The only explicit delete in this API. Every id is filtered by the page, so an
 * id from another page — or another project — can never be reached through it.
 * Ids that matched nothing are counted rather than raising, so a caller racing
 * with the editor gets an idempotent result it can read.
 *
 * The bound `I18nKey` is left alone, matching the editor's delete.
 */
export async function deletePageTags(params: {
  projectId: number
  pageId: number
  tagIds: number[]
}): Promise<DeleteTagsResult> {
  const { projectId, pageId, tagIds } = params
  await assertPageInProject(pageId, projectId)

  // Deduplicated first, so a repeated id is not counted twice in `ignored`.
  const wanted = [...new Set(tagIds)]
  const owned = await prisma.tag.findMany({
    where: { id: { in: wanted }, pageID: pageId },
    select: { id: true },
  })
  const ownedIds = owned.map((row) => row.id)
  if (ownedIds.length) {
    await prisma.tag.deleteMany({ where: { id: { in: ownedIds }, pageID: pageId } })
  }
  return { deleted: ownedIds.length, ignored: wanted.length - ownedIds.length }
}