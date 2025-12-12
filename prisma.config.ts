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
      'Translation_FTS',
      'Translation_FTS_data',
      'Translation_FTS_config',
      'Translation_FTS_docsize',
      'Translation_FTS_idx'
    ]
  }
})
