import { defineConfig } from 'vitest/config'

/**
 * API-level tests boot a real Nuxt dev server (via @nuxt/test-utils/e2e) and
 * hit real routes with $fetch against a throwaway sqlite db, to cover HTTP
 * wiring — status codes, auth/role gating — that the mocked unit tests in
 * `vitest.config.ts` can't see. Slow and sequential; run separately from
 * `pnpm test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/api/**/*.test.ts'],
    globalSetup: ['./test/api/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 240_000,
  },
})
