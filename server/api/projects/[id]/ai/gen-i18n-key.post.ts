import { requireTeamMember } from '#server/helper/access'
import { numericID } from '#server/helper/id'
import { readZodBody } from '#server/helper/validate'
import {
  buildKeySuggestion,
  rethrowAsHttp,
} from '#server/helper/key-suggestion'

/**
 * Naming for an entry rather than a tag — the New Translation dialog and the
 * table's draft rows.
 *
 * There is no page here on purpose: an entry's tags can sit on several pages,
 * so picking one of them as the source of the page-level convention would be
 * arbitrary. The chain is therefore project → default, which is also the right
 * frame — an entry is project-scoped, so its name follows project rules.
 *
 * @route POST /api/projects/:id/ai/gen-i18n-key
 * @description Generate an i18n key name for a piece of text
 * @access Private (team member)
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const nID = numericID(id)
  await requireTeamMember(event, nID)
  const { origin } = await readZodBody(event, zGenI18nKeyForProject.parse)
  try {
    return await buildKeySuggestion({ projectId: nID, origin })
  } catch (error) {
    rethrowAsHttp(error)
  }
})
