import type { I18nKeySuggestion } from '#shared/types'

/**
 * Where the call came from. A tag carries its page's and its own guidance; an
 * entry has neither — its tags can sit on several pages, so the project is the
 * only frame that certainly applies.
 */
export type KeySuggestionScope =
  | {
      tagID: ID
      sourceText: string
      projectPrompt?: string | null
      pagePrompt?: string | null
      tagPrompt?: string | null
    }
  | { projectId: ID; sourceText: string }

/**
 * The request itself, without state — for callers that drive their own.
 *
 * One function for both routes so the three surfaces that name keys cannot
 * drift into three slightly different POSTs. It resolves to null on failure:
 * `useApi` has already toasted the reason.
 */
export async function requestKeySuggestion(
  scope: KeySuggestionScope
): Promise<I18nKeySuggestion | null> {
  if ('tagID' in scope) {
    return useApi<I18nKeySuggestion>('/api/tag/ai/gen-i18n-key', {
      method: 'POST',
      body: {
        projectPrompt: scope.projectPrompt,
        pagePrompt: scope.pagePrompt,
        tagID: scope.tagID,
        tagSourceText: scope.sourceText,
        tagPrompt: scope.tagPrompt,
      },
    })
  }
  return useApi<I18nKeySuggestion>(
    `/api/projects/${scope.projectId}/ai/gen-i18n-key`,
    { method: 'POST', body: { sourceText: scope.sourceText } }
  )
}
