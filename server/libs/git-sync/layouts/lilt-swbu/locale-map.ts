import { LILT_DEFAULT_LOCALE_MAP } from '#shared/constants'

/**
 * Project locale codes (`en`, `zh_cn`) against LILT's file-name locales
 * (`en-US`, `zh-CN`). `GitSyncBinding.localeMap` overrides the defaults.
 */

const inboundAliases: Record<string, string> = {
  'zh-tw': 'zh_tw',
  'zt-TW': 'zh_tw',
  'zt-tw': 'zh_tw',
}

export function localeToRemote(
  local: string,
  override?: Record<string, string> | null
): string {
  const mapped = override?.[local]
  if (mapped) return mapped
  return LILT_DEFAULT_LOCALE_MAP[local] ?? local
}

export function remoteToLocale(
  remote: string,
  override?: Record<string, string> | null
): string | null {
  if (override) {
    for (const [local, mapped] of Object.entries(override)) {
      if (mapped.toLowerCase() === remote.toLowerCase()) return local
    }
  }
  const aliased = inboundAliases[remote] ?? inboundAliases[remote.toLowerCase()]
  if (aliased) return aliased
  const hit = Object.entries(LILT_DEFAULT_LOCALE_MAP).find(
    ([, bcp]) => bcp.toLowerCase() === remote.toLowerCase()
  )
  return hit?.[0] ?? null
}
