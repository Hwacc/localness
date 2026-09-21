/**
 * Generation state for a surface that shows the answer (the New Translation
 * dialog, the table's draft rows). `requestKeySuggestion` holds the request
 * knowledge; this only wraps it in state, so both routes stay in one place.
 */
export function useI18nKeyGeneration() {
  const loading = ref(false)
  const suggestion = ref<I18nKeySuggestion | null>(null)

  async function generate(scope: KeySuggestionScope) {
    loading.value = true
    // Cleared up front so a second run cannot show the previous answer while
    // the new one is still in flight.
    suggestion.value = null
    try {
      suggestion.value = await requestKeySuggestion(scope)
    } finally {
      loading.value = false
    }
  }

  return { loading, suggestion, generate }
}
