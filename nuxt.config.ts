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
    'nuxt-auth-utils',
  ],
  runtimeConfig: {
    public: {
      imageBase: process.env.NUXT_PUBLIC_QINIU_DOMAIN,
    },
  },
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
    '/transfer': { ssr: false },
    '/editor': { ssr: false },
  },
  auth: {
    hash: {
      scrypt: {
        saltSize: process.env.NUXT_SALT_SIZE
          ? parseInt(process.env.NUXT_SALT_SIZE)
          : 10,
      },
    },
  },
  pinia: {
    storesDirs: ['./stores/**'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
