import { joinURL, withTrailingSlash } from 'ufo'
import { v4 as uuidv4 } from 'uuid'

export const LOCAL_OSS_PUBLIC_BASE = '/upload/'

export function uuidFilename(filename: string) {
  const [_, ext] = filename.split('.')
  return `${uuidv4()}.${ext}`
}

export function getFileKey(filePath = '') {
  const normalized = filePath.replace(/\\/g, '/')
  const lastPart = normalized.split('/').pop()
  return lastPart || ''
}

/** Browser path for a LOCAL-engine object. Empty `ossBaseUrl` used to become `/{uuid}.png`. */
export function localOssPublicPath(key: string, baseUrl?: string | null) {
  const filename = getFileKey(key)
  if (!filename) return ''
  const base = baseUrl?.trim() || LOCAL_OSS_PUBLIC_BASE
  return joinURL(withTrailingSlash(base), filename)
}
