/**
 * @route GET /api/auth/providers
 * @description Which OAuth providers are configured (no secrets)
 * @access Public
 */
export default defineEventHandler(async () => {
  const { oauth } = useRuntimeConfig()
  const atlassian = oauth?.atlassian
  return {
    atlassian: Boolean(atlassian?.clientId && atlassian?.clientSecret),
  }
})
