import { readZodBody } from '#server/helper/validate'
import { requireTagTeamMember } from '#server/helper/access'
import { numericID } from '#server/helper/id'
import {
  buildKeySuggestion,
  rethrowAsHttp,
} from '#server/helper/key-suggestion'

/**
 * @route POST /api/tag/ai/gen-i18n-key
 * @description Generate i18n key for the tag being edited
 * @access Private
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const params = await readZodBody(event, zGenI18nKey.parse)
  const { tag } = await requireTagTeamMember(event, numericID(params.tagID))
  // `requireTagTeamMember` has already 404'd a tag without a page; the guard is
  // only there because the relation is typed nullable.
  const projectID = tag.page?.projectID
  if (!projectID) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }
  try {
    const suggestion = await buildKeySuggestion({
      projectId: projectID,
      pageID: tag.page?.id,
      origin: params.tagOrigin,
      // The caller knows this tag's own context, so its guidance wins.
      prompts: {
        project: params.projectPrompt,
        page: params.pagePrompt,
        tag: params.tagPrompt,
      },
    })
    return { tagID: numericID(params.tagID), ...suggestion }
  } catch (error) {
    rethrowAsHttp(error)
  }
})
