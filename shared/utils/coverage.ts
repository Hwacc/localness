import type { II18nKeyRow } from '../types/I18nKey'
import { isTranslationOutdated } from './outdated'

/**
 * Where one language of a key stands. `draft` means its text differs from what
 * is published (including text not published yet); `outdated` means it was
 * written against an older source sentence of a published key.
 */
export type LocaleCoverageState = 'published' | 'draft' | 'outdated' | 'missing'

/** In legend order: from done to not started. */
export const LOCALE_COVERAGE_STATES: readonly LocaleCoverageState[] = [
  'published',
  'draft',
  'outdated',
  'missing',
]

export const LOCALE_COVERAGE_LABEL: Record<LocaleCoverageState, string> = {
  published: 'Published',
  draft: 'Draft',
  outdated: 'Outdated',
  missing: 'Missing',
}

export const LOCALE_COVERAGE_HINT: Record<LocaleCoverageState, string> = {
  published: 'Has text, and it matches what is published',
  draft: 'New or changed text, not published yet',
  outdated: 'Written against an older source text',
  missing: 'No text yet',
}

export function localeCoverageState(
  key: Pick<II18nKeyRow, 'dirty' | 'fingerprint' | 'locales'>,
  locale: string,
  sourceLocale: string,
): LocaleCoverageState {
  const row = key.locales.find((item) => item.locale === locale)
  const draft = row?.draftText ?? ''
  const published = row?.publishedText ?? ''
  if (!draft && !published) return 'missing'
  if (
    isTranslationOutdated({
      locale,
      sourceLocale,
      draftText: draft,
      publishedText: published,
      sourceFingerprint: row?.sourceFingerprint ?? '',
      keyFingerprint: key.fingerprint ?? '',
      keyIsDraft: key.dirty,
    })
  ) {
    return 'outdated'
  }
  return draft === published ? 'published' : 'draft'
}
