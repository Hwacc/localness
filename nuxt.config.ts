// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import fs from 'node:fs/promises'
import { execSync } from 'node:child_process'
import pkg from './package.json'

/**
 * The commit the About line shows. `.git` is excluded from the Docker build
 * context, so an image cannot read its own — it takes one from
 * `NUXT_PUBLIC_APP_COMMIT`, which is also the knob for correcting it without a
 * rebuild. Neither value may break the config, so both fall back to empty.
 */
function buildCommit(): string {
  if (process.env.NUXT_PUBLIC_APP_COMMIT) {
    return process.env.NUXT_PUBLIC_APP_COMMIT
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export default defineNuxtConfig({
  alias: {
    '#server': resolve(process.cwd(), 'server'),
  },
  compatibilityDate: '2026-08-05',
  app: {
    head: {
      title: 'Localness',
      link: [
        { rel: 'icon', type: 'image/png', href: '/logo.png' },
        { rel: 'apple-touch-icon', href: '/logo.png' },
      ],
    },
  },
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  sourcemap: process.env.NODE_ENV === 'development',
  modules: [
    '@nuxt/ui',
    '@nuxt/icon',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'motion-v/nuxt',
    'nuxt-auth-utils',
  ],
  runtimeConfig: {
    oauth: {
      atlassian: {
        clientId: '',
        clientSecret: '',
      },
    },
    atlassianAllowedEmailDomains: '',
    public: {
      ossEngine: process.env.NUXT_PUBLIC_OSS_ENGINE || 'LOCAL',
      ossBaseUrl: process.env.NUXT_PUBLIC_OSS_BASE_URL || '/upload/',
      appVersion: pkg.version,
      appCommit: buildCommit(),
    },
  },
  css: ['~/assets/css/index.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    classSuffix: '',
  },
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
    dirs: ['utils/**', 'stores' ],
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
    '/': { prerender: false, ssr: true },
    '/transfer': { ssr: false },
    '/dashboard': { ssr: false },
    '/editor': { ssr: false },
    '/translations': { ssr: false },
    '/git': { ssr: false },
    '/skills': { ssr: false },
    '/api': { ssr: false },
    '/teams': { ssr: false },
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
    // qiniu-js expects spark-md5's CJS interop (`export { require as t }`).
    // If spark-md5 is optimized first as a standalone ESM default, later
    // qiniu-js chunks fail: "does not provide an export named 't'".
    optimizeDeps: {
      include: ['spark-md5', 'qiniu-js'],
    },
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
        const chunksDir = resolve(process.cwd(), '.output/server/chunks')
        let nirtroFileUrl: string
        let content: string
        try {
          // Search for nitro.mjs in all subdirectories
          const files = await fs.readdir(chunksDir, {
            recursive: true,
            withFileTypes: true,
          })
          const nitroFile = files.find(
            (file) => file.isFile() && file.name === 'nitro.mjs'
          )
          if (!nitroFile) {
            console.warn('nitro.mjs not found in', chunksDir)
            return
          }
          // Get the full path by joining the chunksDir with the relative path of the file
          const relativePath = nitroFile.parentPath
            ? resolve(nitroFile.parentPath, nitroFile.name)
            : nitroFile.name
          nirtroFileUrl = resolve(chunksDir, relativePath)
          content = await fs.readFile(nirtroFileUrl, 'utf8')
        } catch (error) {
          console.error('Error searching for nitro.mjs:', error)
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
        // Nuxt defaults to module: "preserve", which rejects import() and import.meta.
        module: 'ESNext',
      },
    },
  },
  build: {
    transpile: [/prisma/],
  },
})
