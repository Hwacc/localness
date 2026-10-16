import { licenseState } from '#server/helper/license'
import { LICENSE_GRACE_DAYS } from '#shared/constants'

/**
 * Logs the license verdict once at boot. Warns only, never blocks — a typo in
 * `NUXT_LICENSE_KEY` must not take the instance down; it just runs free. Unlike
 * `check-migrations.ts` this is not dev-only: a production typo is exactly the
 * case that needs a visible log line.
 */
export default defineNitroPlugin(() => {
  try {
    const state = licenseState()
    if (state.status === 'none') return

    if (state.status === 'invalid') {
      console.warn(
        '[license] NUXT_LICENSE_KEY is set but not a valid license. Running the free tier.'
      )
      return
    }

    if (state.status === 'active') {
      console.log(
        `[license] Plus active for ${state.customer} until ${state.expiresAt}`
      )
      return
    }

    if (state.status === 'grace') {
      console.warn(
        `[license] Plus in grace period for ${state.customer}. Renew before ${state.expiresAt}; Plus stops after the ${LICENSE_GRACE_DAYS}-day grace.`
      )
      return
    }

    console.warn(
      `[license] Plus expired for ${state.customer}. Read-only downgrade; existing data stays readable and exportable.`
    )
  } catch (error) {
    // Never block boot over a diagnostic.
    console.warn('[license] Could not check license state:', error)
  }
})
