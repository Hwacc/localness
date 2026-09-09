import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'pnpm exec tsx ./prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
  experimental: {
    externalTables: true
  },
  tables: {
    external: [
      'I18nKey_FTS',
      'I18nKey_FTS_data',
      'I18nKey_FTS_config',
      'I18nKey_FTS_docsize',
      'I18nKey_FTS_idx',
    ]
  }
})
