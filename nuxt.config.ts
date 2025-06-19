// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/icon', '@nuxt/eslint'],
  css: ['~/assets/css/index.css'],
  imports: {
    dirs: ['utils/**'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
