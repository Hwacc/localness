// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import fs from 'node:fs/promises'

export default defineNuxtConfig({
  alias: {
    '#server': resolve(process.cwd(), './server'),
  },
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
      ossEngine: process.env.NUXT_PUBLIC_OSS_ENGINE,
      ossBaseUrl: process.env.NUXT_PUBLIC_OSS_BASE_URL,
    },
  },
  css: ['~/assets/css/index.css'],
  icon: {
    serverBundle: {
      collections: ['lucide'],
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },
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
    {
      path: '~/components/slideovers',
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
    storesDirs: ['./app/stores/**'],
  },
  vite: {
    worker: {
      format: 'es',
    },
    plugins: [tailwindcss()],
  },
  nitro: {
    externals: {
      external: ['@prisma/client', '.prisma'],
    },
    hooks: {
      /**
       * when we built prisma client with esm mode, there is a '__dirname' not be complied
       * so we need a polyfill to fix __dirname in nitro.mjs to make it work
       * @returns
       */
      compiled: async () => {
        if (process.env.NODE_ENV !== 'production') return
        const nirtroFileUrl = resolve(
          process.cwd(),
          './.output/server/chunks/_/nitro.mjs'
        )
        let content = ''
        try {
          // try to read nitro mjs file
          content = await fs.readFile(nirtroFileUrl, 'utf8')
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          return
        }
        content = content.replace('__dirname', 'globalThis.__dirname')
        const injectCode = /*javascript*/ `
          import { fileURLToPath as fileURLToPath$polyfill } from 'node:url';
          import { dirname as dirname$polyfill } from 'node:path';
          const __filename = fileURLToPath$polyfill(import.meta.url);
          globalThis.__dirname = dirname$polyfill(__filename);
        `
        content = injectCode + content
        await fs.writeFile(nirtroFileUrl, content)
        console.log('polyfill: Nitro file updated')
      },
    },
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  build: {
    transpile: [/prisma/],
  },
})
