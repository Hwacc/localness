export type LicenseView = {
  status: 'none' | 'invalid' | 'active' | 'grace' | 'expired'
  plus: boolean
  customer?: string
  licenseId?: string
  expiresAt?: string
}

/**
 * Instance Plus state for UI gating. Shared so the badge and gated pages
 * cannot drift apart on the endpoint or the shape; each caller loads on mount
 * — license state changes with a container restart, not mid-session.
 */
export function useLicenseState() {
  const state = ref<LicenseView | null>(null)

  async function load() {
    state.value = await $fetch<LicenseView>('/api/license')
  }

  return { state, load }
}
