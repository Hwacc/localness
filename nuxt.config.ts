// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'motion-v/nuxt',
  ],
  css: ['~/assets/css/index.css'],
  imports: {
    dirs: ['utils/**'],
  },
  components: [
    {
      path: '~/components/effects',
      pathPrefix: false,
    },
    {
      path: '~/components/modals',
      pathPrefix: false,
    },
    '~/components',
  ],
  routeRules: {
    '/': { prerender: true },
    '/editor': { ssr: false },
  },
  pinia: {
    storesDirs: ['./stores/**'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
