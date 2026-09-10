import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Unit tests only — plain node, no Nuxt runtime, so these stay fast enough
 * to run on every change. API-level tests live in `vitest.config.api.ts`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Nitro auto-injects h3 at runtime; unit tests only need `createError`
      // to throw, so a stub avoids pulling in the server dependency tree.
      h3: fileURLToPath(new URL('./test/stubs/h3.ts', import.meta.url)),
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
