import prisma from '#server/libs/prisma'
import { numericID } from '#server/helper/id'
import { requireTeamMember } from '#server/helper/access'
import { sourceLocaleOf, sourceTextOf } from '#server/helper/i18n'
import { shapeKeyDuplicates } from '#server/helper/key-convention'

/** Headroom, not a limit the UI can reach: manual entry asks about one key. */
const MAX_KEYS = 50

/**
 * @route GET /api/projects/:id/i18n-keys/check?keys=a&keys=b&sourceText=<text>
 * @description Which of these exact keys the project already has. Read-only,
 * and the only way manual key entry can ask before saving — the list endpoint
 * matches on substrings, and `/api/translation/check` looks up by fingerprint.
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)

  // Repeated params, not one comma-joined value: a project may configure a
  // comma as its key separator.
  const raw = getQuery(event).keys
  const keys = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((key) => String(key).trim())
    .filter(Boolean)
    .slice(0, MAX_KEYS)
  if (!keys.length) return { duplicates: [] }

  const sourceLocale = await sourceLocaleOf(nID)
  const rows = await prisma.i18nKey.findMany({
    where: { projectId: nID, key: { in: keys } },
    select: {
      key: true,
      locales: {
        where: { locale: sourceLocale },
        select: { locale: true, draftText: true },
      },
    },
  })
  return {
    duplicates: shapeKeyDuplicates(
      // What a key holds is its source text, which lives in that one locale.
      rows.map((row) => ({
        key: row.key,
        sourceText: sourceTextOf(row.locales, sourceLocale),
      })),
      String(getQuery(event).sourceText ?? '')
    ),
  }
})
