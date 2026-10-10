/**
 * A non-source locale is outdated when it still has text written against a
 * different source sentence. Empty text is "missing", not outdated.
 */
export function isTranslationOutdated(input: {
  locale: string
  sourceLocale: string
  draftText: string | null
  publishedText?: string | null
  sourceFingerprint: string
  keyFingerprint: string
}): boolean {
  if (input.locale === input.sourceLocale) return false
  const hasText = (input.draftText ?? '') !== '' || (input.publishedText ?? '') !== ''
  if (!hasText) return false
  return input.sourceFingerprint !== input.keyFingerprint
}
