import { createError } from 'h3'
import { GitSyncAdapter } from '#shared/constants'
import type { GitSyncLayout } from './types'
import { liltSwbu } from './lilt-swbu'
import { localeFiles } from './locale-files'

function parseAdapter(adapter: string): GitSyncAdapter {
  switch (adapter) {
    case GitSyncAdapter.LILT_SWBU:
      return GitSyncAdapter.LILT_SWBU
    case GitSyncAdapter.LOCALE_FILES:
      return GitSyncAdapter.LOCALE_FILES
    default:
      throw createError({
        statusCode: 400,
        statusMessage: `Unknown Git sync adapter: ${adapter}`,
      })
  }
}

export function gitSyncLayout(adapter: string): GitSyncLayout {
  const parsed = parseAdapter(adapter)
  switch (parsed) {
    case GitSyncAdapter.LILT_SWBU:
      return liltSwbu
    case GitSyncAdapter.LOCALE_FILES:
      return localeFiles
    default: {
      const unreachable: never = parsed
      return unreachable
    }
  }
}
